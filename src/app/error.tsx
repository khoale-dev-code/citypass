"use client";
export default function Error({ reset }: { reset: () => void }) { return <main className="loading-root"><p>Không thể hiển thị bản đồ lúc này.</p><button onClick={reset}>Thử lại</button></main>; }
