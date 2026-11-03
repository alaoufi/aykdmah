import { useLayoutEffect, useRef } from 'react';
import { pageZoom } from '../utils/pageZoom';

// The browser viewport changes with the keyboard, browser chrome and text zoom.
// Keep only the chat's scroll panes moving, rather than the entire document.
export default function useChatViewport() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const update = () => {
      const element = ref.current;
      if (!element) return;
      const zoom = pageZoom();
      const values = {
        top: viewport?.offsetTop || 0, left: viewport?.offsetLeft || 0,
        width: viewport?.width || window.innerWidth, height: viewport?.height || window.innerHeight,
      };
      for (const [name, value] of Object.entries(values)) {
        element.style.setProperty(`--chat-viewport-${name}`, `${value / zoom}px`);
      }
    };
    root.classList.add('chat-viewport-open');
    update();
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['style'] });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      root.classList.remove('chat-viewport-open');
    };
  }, []);
  return ref;
}
