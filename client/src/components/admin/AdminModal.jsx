import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Modal from '../common/Modal';
import { getToken } from '../../services/api';

// WebKit may scroll the document to zero when focusing an input in a fixed
// bottom sheet with body overflow locked. Restore the list position on close.
export default function AdminModal(props) {
  const { scrollOrigin, ...modalProps } = props;
  const location = useLocation();
  const navigation = useRef(0);
  useLayoutEffect(() => { navigation.current++; }, [location.key, location.pathname, location.search]);
  useLayoutEffect(() => {
    if (!props.open) return;
    const saved = { x: scrollOrigin?.x ?? window.scrollX, y: scrollOrigin?.y ?? window.scrollY, route: window.location.pathname + window.location.search, token: getToken(), generation: navigation.current };
    return () => {
      const restore = () => {
        if (navigation.current === saved.generation && getToken() === saved.token
          && window.location.pathname + window.location.search === saved.route) {
          window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
        }
      };
      restore();
      requestAnimationFrame(restore); // Run after the base Modal releases its overflow lock.
    };
  }, [props.open]);
  return <Modal {...modalProps} />;
}
