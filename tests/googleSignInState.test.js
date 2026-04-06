import {
  buildGoogleButtonRenderKey,
  shouldInitializeGoogleIdentity,
} from '../client/src/components/auth/googleSignInState';

describe('google sign-in lifecycle helpers', () => {
  it('does not request another initialize call for the same client id', () => {
    expect(shouldInitializeGoogleIdentity('client-id', 'client-id')).toBe(false);
  });

  it('keeps button render keys stable for the same client and button text', () => {
    expect(buildGoogleButtonRenderKey('client-id', 'signin_with')).toBe('client-id:signin_with');
  });
});
