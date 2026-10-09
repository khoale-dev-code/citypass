"use client";
import { useEffect, useRef, useState } from "react";
export default function CameraPlayer({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !parsed.pathname.endsWith(".m3u8")) {
        setError("Nguồn camera cần dùng HTTPS và đuôi .m3u8."); return;
      }
    } catch { setError("URL camera không hợp lệ."); return; }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { setError("Trình duyệt không hỗ trợ phát HLS."); return; }
        const player = new Hls({ enableWorker: true, lowLatencyMode: true });
        destroy = () => player.destroy();
        player.loadSource(url); player.attachMedia(video);
        player.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal && !cancelled) setError("Luồng video bị gián đoạn hoặc nhà cung cấp chưa bật CORS."); });
      }).catch(() => { if (!cancelled) setError("Không nạp được trình phát HLS."); });
    }
    return () => { cancelled = true; video.pause(); destroy?.(); video.removeAttribute("src"); video.load(); };
  }, [url]);
  return <div><video ref={ref} controls playsInline autoPlay muted style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12, background: "#0d2522" }} /><p className="subtle">Video chỉ phát khi mở cửa sổ này và tự ngắt khi đóng.</p>{error && <p role="alert" className="notice-error">{error}</p>}</div>;
}
