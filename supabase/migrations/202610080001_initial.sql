  -- Lối Ráo MVP / Postgres + PostGIS. Chạy một lần trong SQL Editor của Supabase.
  create schema if not exists extensions;
  create extension if not exists postgis with schema extensions;

  create table if not exists public.incidents (
    id uuid primary key default gen_random_uuid(),
    type text not null check (type in ('FLOOD', 'TRAFFIC_JAM')),
    severity smallint not null check (severity between 1 and 3),
    title text not null,
    description text,
    water_depth_cm numeric(6,2) check (water_depth_cm is null or water_depth_cm >= 0),
    latitude double precision not null check (latitude between -90 and 90),
    longitude double precision not null check (longitude between -180 and 180),
    location extensions.geography(Point, 4326),
    region_key text,
    source text not null check (source in ('AFSC_SENSOR','COMMUNITY')),
    sensor_id text unique,
    status text not null default 'PENDING' check (status in ('PENDING','VERIFIED','ACTIVE','HIDDEN')),
    created_by uuid references auth.users(id),
    photo_url text,
    created_at timestamptz not null default now(),
    expires_at timestamptz
  );
  create index if not exists idx_incidents_geometry on public.incidents using gist (location);
  create index if not exists idx_incidents_status_expires on public.incidents (status, expires_at);
  create index if not exists idx_incidents_actor_created on public.incidents (created_by, created_at desc);
  create index if not exists idx_incidents_region_key on public.incidents (region_key);

  create or replace function public.set_incident_location()
  returns trigger language plpgsql set search_path = public, extensions, pg_temp as $$
  begin
    new.location := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::extensions.geography;
    new.region_key := floor(new.latitude / 0.02)::text || ':' || floor(new.longitude / 0.02)::text;
    return new;
  end;
  $$;
  create trigger incidents_location_before_write before insert or update of latitude, longitude on public.incidents
  for each row execute function public.set_incident_location();

  create table if not exists public.reports (
    id uuid primary key default gen_random_uuid(),
    incident_id uuid not null unique references public.incidents(id) on delete cascade,
    reporter_id uuid not null references auth.users(id),
    note text not null check (char_length(note) between 10 and 500),
    photo_url text,
    created_at timestamptz not null default now()
  );
  create index if not exists idx_reports_reporter on public.reports(reporter_id);

  create table if not exists public.report_verifications (
    id bigint generated always as identity primary key,
    incident_id uuid not null references public.incidents(id) on delete cascade,
    voter_id uuid not null references auth.users(id),
    vote_type text not null check (vote_type in ('confirm','false_alarm')),
    latitude double precision not null,
    longitude double precision not null,
    accuracy_m double precision not null,
    created_at timestamptz not null default now(),
    unique (incident_id, voter_id)
  );
  create index if not exists idx_report_votes_incident on public.report_verifications(incident_id, vote_type, created_at);
  create index if not exists idx_report_votes_voter on public.report_verifications(voter_id);

  create table if not exists public.cameras (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    latitude double precision not null check (latitude between -90 and 90),
    longitude double precision not null check (longitude between -180 and 180),
    location extensions.geography(Point,4326),
    stream_url text,
    is_public boolean not null default false,
    updated_at timestamptz not null default now()
  );
  create index if not exists idx_cameras_geometry on public.cameras using gist(location);
  create or replace function public.set_camera_location()
  returns trigger language plpgsql set search_path = public, extensions, pg_temp as $$
  begin
    new.location := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::extensions.geography;
    return new;
  end;
  $$;
  create trigger cameras_location_before_write before insert or update of latitude,longitude on public.cameras
  for each row execute function public.set_camera_location();

  -- Chỉ xuất thông tin sự kiện không chứa email, token, user_id hoặc thông tin nhạy cảm.
  create table if not exists public.incident_events (
    id bigint generated always as identity primary key,
    incident_id uuid not null,
    region_key text not null,
    event_kind text not null check (event_kind in ('upsert','remove')),
    created_at timestamptz not null default now()
  );
  create index if not exists idx_incident_events_region on public.incident_events(region_key,created_at desc);
  create or replace function public.emit_incident_event()
  returns trigger language plpgsql set search_path = public, extensions, pg_temp as $$
  begin
    insert into public.incident_events(incident_id,region_key,event_kind)
    values (new.id, new.region_key,
      case when new.status = 'HIDDEN' or (new.expires_at is not null and new.expires_at <= now()) then 'remove' else 'upsert' end);
    return new;
  end;
  $$;
  create trigger incident_event_after_write after insert or update on public.incidents
  for each row execute function public.emit_incident_event();

  alter table public.incidents enable row level security;
  alter table public.reports enable row level security;
  alter table public.report_verifications enable row level security;
  alter table public.cameras enable row level security;
  alter table public.incident_events enable row level security;

  create policy "read visible incidents" on public.incidents for select to anon,authenticated
  using (status in ('ACTIVE','VERIFIED','PENDING') and (expires_at is null or expires_at > now()));
  -- Ẩn danh tính người gửi khi truy cập incidents qua anon/authenticated.
  revoke all on table public.incidents from anon, authenticated;
  grant select (id,type,severity,title,description,water_depth_cm,latitude,longitude,location,
    region_key,source,sensor_id,status,photo_url,created_at,expires_at) on table public.incidents to anon,authenticated;

  create policy "read own reports" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
  create policy "read own votes" on public.report_verifications for select to authenticated
  using (voter_id = (select auth.uid()));
  create policy "read licensed cameras" on public.cameras for select to anon,authenticated
  using (is_public = true);
  create policy "read event signals" on public.incident_events for select to anon,authenticated using (true);
  -- Dữ liệu chỉ ghi qua server service-role + transaction RPC. Không grant insert/update/delete công khai.

  create or replace function public.nearby_incidents(p_lat double precision, p_lng double precision, p_radius_km double precision default 5)
  returns table(id uuid,type text,severity smallint,title text,description text,water_depth_cm numeric,
  latitude double precision,longitude double precision,source text,sensor_id text,status text,photo_url text,
  confirms bigint,rejects bigint,created_at timestamptz,expires_at timestamptz)
  language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  select i.id,i.type,i.severity,i.title,i.description,i.water_depth_cm,
          i.latitude,i.longitude,i.source,i.sensor_id,i.status,i.photo_url,
          (select count(*) from public.report_verifications v where v.incident_id=i.id and v.vote_type='confirm' and v.created_at <= i.created_at + interval '15 minutes') as confirms,
          (select count(*) from public.report_verifications v where v.incident_id=i.id and v.vote_type='false_alarm') as rejects,
          i.created_at,i.expires_at
  from public.incidents i
  where p_lat between -90 and 90 and p_lng between -180 and 180
    and p_radius_km between 0.1 and 30
    and ST_DWithin(i.location, ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::extensions.geography, p_radius_km*1000)
    and i.status in ('ACTIVE','VERIFIED','PENDING') and (i.expires_at is null or i.expires_at>now())
  order by ST_Distance(i.location,ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::extensions.geography) asc limit 200;
  $$;

  create or replace function public.nearby_cameras(p_lat double precision,p_lng double precision,p_radius_km double precision default 5)
  returns table(id uuid,title text,lat double precision,lng double precision,stream_url text,updated_at timestamptz)
  language sql stable security invoker set search_path = public, extensions, pg_temp as $$
    select c.id,c.title,c.latitude,c.longitude,c.stream_url,c.updated_at from public.cameras c
    where c.is_public = true and p_lat between -90 and 90 and p_lng between -180 and 180
      and p_radius_km between 0.1 and 30
      and ST_DWithin(c.location, ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::extensions.geography,p_radius_km*1000)
    order by ST_Distance(c.location,ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::extensions.geography) limit 100;
  $$;

  create or replace function public.submit_community_report(
  p_actor uuid,p_type text,p_lat double precision,p_lng double precision,
  p_severity smallint,p_note text,p_photo_url text default null)
  returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
  declare new_id uuid;
  begin
    if not exists(select 1 from auth.users where id=p_actor) then raise exception 'UNAUTHORIZED'; end if;
    if p_type not in ('FLOOD','TRAFFIC_JAM') or p_severity not between 1 and 3
      or p_lat not between -90 and 90 or p_lng not between -180 and 180
      or length(trim(p_note)) not between 10 and 500 then raise exception 'BAD_INPUT'; end if;
    perform pg_advisory_xact_lock(hashtext(p_actor::text));
    if (select count(*) from public.reports where reporter_id=p_actor and created_at>now()-interval '60 minutes') >= 3 then
      raise exception 'RATE_LIMIT';
    end if;
    insert into public.incidents(type,severity,title,description,latitude,longitude,source,status,created_by,photo_url,expires_at)
    values(p_type,p_severity,case when p_type='FLOOD' then 'Người dùng báo ngập' else 'Người dùng báo ùn tắc' end,
          trim(p_note),p_lat,p_lng,'COMMUNITY','PENDING',p_actor,p_photo_url,now()+interval '90 minutes') returning id into new_id;
    insert into public.reports(incident_id,reporter_id,note,photo_url) values(new_id,p_actor,trim(p_note),p_photo_url);
    return new_id;
  end;
  $$;

  create or replace function public.verify_community_report(
  p_actor uuid,p_report_id uuid,p_vote_type text,p_lat double precision,p_lng double precision,p_accuracy_m double precision)
  returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
  declare event_row public.incidents%rowtype; confirm_count bigint; reject_count bigint; new_status text;
  begin
    if p_vote_type not in ('confirm','false_alarm') or p_accuracy_m not between 0 and 100 or
      p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'BAD_INPUT'; end if;
    if not exists(select 1 from auth.users where id=p_actor) then raise exception 'UNAUTHORIZED'; end if;
    select * into event_row from public.incidents where id=p_report_id for update;
    if not found or event_row.source <> 'COMMUNITY' or event_row.status='HIDDEN' or
      event_row.expires_at <= now() or event_row.created_by=p_actor then raise exception 'NOT_ELIGIBLE'; end if;
    if p_vote_type='confirm' and event_row.created_at < now()-interval '15 minutes' then raise exception 'CONFIRM_WINDOW_CLOSED'; end if;
    -- Kiểm tra bán kính tại server, nhưng GPS từ trình duyệt vẫn có thể bị giả mạo (xem docs/SECURITY.md).
    if not ST_DWithin(event_row.location, ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::extensions.geography,200)
    then raise exception 'TOO_FAR'; end if;
    insert into public.report_verifications(incident_id,voter_id,vote_type,latitude,longitude,accuracy_m)
      values(p_report_id,p_actor,p_vote_type,p_lat,p_lng,p_accuracy_m);
    select count(*) filter(where vote_type='confirm' and created_at <= event_row.created_at+interval '15 minutes'),
          count(*) filter(where vote_type='false_alarm')
      into confirm_count,reject_count from public.report_verifications where incident_id=p_report_id;
    -- Khi xung đột: bác bỏ được ưu tiên cho đến khi có quy trình xử lý tranh chấp.
    new_status := case when reject_count>=2 then 'HIDDEN' when confirm_count>=3 then 'VERIFIED' else event_row.status end;
    if new_status <> event_row.status then update public.incidents set status=new_status where id=p_report_id; end if;
    return jsonb_build_object('status',new_status,'confirms',confirm_count,'rejects',reject_count);
  end;
  $$;

  revoke all on function public.submit_community_report(uuid,text,double precision,double precision,smallint,text,text) from public,anon,authenticated;
  revoke all on function public.verify_community_report(uuid,uuid,text,double precision,double precision,double precision) from public,anon,authenticated;
  grant execute on function public.submit_community_report(uuid,text,double precision,double precision,smallint,text,text) to service_role;
  grant execute on function public.verify_community_report(uuid,uuid,text,double precision,double precision,double precision) to service_role;
  grant execute on function public.nearby_incidents(double precision,double precision,double precision) to anon,authenticated,service_role;
  grant execute on function public.nearby_cameras(double precision,double precision,double precision) to anon,authenticated,service_role;

  -- Chính sách ảnh báo cáo: người đăng nhập chỉ được upload vào thư mục UID của họ.
  insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
  values ('report-photos','report-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;
  create policy "upload own report image" on storage.objects for insert to authenticated
  with check (bucket_id='report-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);

  -- Realtime chỉ phát thông điệp có region_key, không chứa thông tin người dùng.
  do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='incident_events') then
    alter publication supabase_realtime add table public.incident_events;
  end if;
  end $$;
