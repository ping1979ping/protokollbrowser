import { useState, useEffect } from 'react';

export default function ScrollToTopFab() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 100);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-3 left-3 bg-white text-ping-blue border-2 border-ping-blue w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg font-bold z-[999] hover:bg-ping-blue-light active:bg-ping-blue-light transition"
      aria-label="Nach oben"
    >
      ↑
    </button>
  );
}
