"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { Camera } from "@/lib/types";

/** Only renders the official image while the popup is open; no proxy, scraping, or image storage. */
export default function CameraSnapshot({ camera }: { camera: Camera }) {
  const [tick, setTick] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    const interval = window.setInterval(() => { setError(false); setTick(t => t + 1); }, 30_000);
    return () => window.clearInterval(interval);
  }, [camera.id]);
  if (!camera.snapshot_url) return null;
  const sep = camera.snapshot_url.includes("?") ? "&" : "?";
  const src = `${camera.snapshot_url}${sep}refresh=${tick}`;
  return <div className="camera-snapshot">
    {!error ? <div className="camera-image-wrap"><Image unoptimized width={800} height={450} key={src} src={src} alt={`Ảnh camera ${camera.title}`} onError={() => setError(true)} referrerPolicy="no-referrer" /></div>
      : <p className="notice-error" role="alert">Máy chủ camera chưa trả ảnh hoặc không cho phép xem từ website này. Mở nguồn gốc để kiểm tra.</p>}
    <div className="camera-actions"><button className="btn" type="button" onClick={() => { setError(false); setTick(t => t + 1); }}>Làm mới ảnh</button>
      <a className="btn" href={camera.snapshot_url} target="_blank" rel="noopener noreferrer">Mở ảnh gốc</a>
    </div>
    <p className="subtle">Ảnh tự yêu cầu làm mới mỗi 30 giây khi đang mở. Không phải video; thời điểm chụp thực tế không được nguồn cung cấp.</p>
    {camera.source_url && <a href={camera.source_url} target="_blank" rel="noopener noreferrer" className="camera-source">Nguồn danh sách: rin2401.github.io/map</a>}
  </div>;
}
