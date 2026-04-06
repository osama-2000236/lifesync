import { useEffect, useRef, useState } from 'react';
import { getGoogleClientId } from '../../config/runtime';
import { buildGoogleButtonRenderKey, googleIdentityState } from './googleSignInState';

const GOOGLE_SCRIPT_ID = 'google-identity-services';

const loadGoogleScript = () => {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }

  return new Promise((resolve, reject) => {
    let script = document.getElementById(GOOGLE_SCRIPT_ID);

    const handleLoad = () => resolve(window.google);
    const handleError = () => reject(new Error('Failed to load Google Sign-In.'));

    if (!script) {
      script = document.createElement('script');
      script.id = GOOGLE_SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      document.head.appendChild(script);
      return;
    }

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
  });
};

export default function GoogleSignInButton({
  onSuccess,
  onError,
  text = 'signin_with',
}) {
  const buttonRef = useRef(null);
  const successRef = useRef(onSuccess);
  const errorRef = useRef(onError);
  const [scriptError, setScriptError] = useState('');
  const clientId = getGoogleClientId();

  useEffect(() => {
    successRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;

    if (!clientId || !buttonRef.current) {
      return undefined;
    }

    const renderKey = buildGoogleButtonRenderKey(clientId, text);

    loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) {
          return;
        }

        if (googleIdentityState.shouldInitialize(clientId)) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (credentialResponse) => successRef.current?.(credentialResponse),
          });
          googleIdentityState.markInitialized(clientId);
        }

        if (buttonRef.current.dataset.googleRenderKey === renderKey) {
          setScriptError('');
          return;
        }

        buttonRef.current.innerHTML = '';

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text,
          logo_alignment: 'left',
          width: buttonRef.current.offsetWidth || 360,
        });
        buttonRef.current.dataset.googleRenderKey = renderKey;
        setScriptError('');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setScriptError(error.message);
        errorRef.current?.(error);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (!clientId) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div ref={buttonRef} className="w-full min-h-[44px] flex justify-center" />
      {scriptError && (
        <p className="text-xs text-coral-500 text-center" role="alert" aria-live="assertive">{scriptError}</p>
      )}
    </div>
  );
}
