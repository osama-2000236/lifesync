import {
  buildGoogleButtonRenderKey,
  shouldInitializeGoogleIdentity,
} from '../client/src/components/auth/googleSignInState';

describe('google sign-in lifecycle helpers', () => {
  it('does not request another initialize call for the same client id', () => {
    expect(shouldInitializeGoogleIdentity('client-id', 'client-id')).toBe(false);
  });

  it('keeps button render keys stable for the same client, text, and locale', () => {
    expect(buildGoogleButtonRenderKey('client-id', 'signin_with', 'en')).toBe('client-id:signin_with:en');
    expect(buildGoogleButtonRenderKey('client-id', 'signin_with', 'ar')).toBe('client-id:signin_with:ar');
  });

  it('changes the render key when the locale changes so the button re-renders', () => {
    expect(buildGoogleButtonRenderKey('client-id', 'signin_with', 'en'))
      .not.toBe(buildGoogleButtonRenderKey('client-id', 'signin_with', 'ar'));
  });
});
