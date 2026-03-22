

export const API_BASE_URL = __DEV__
  ? 'http://192.168.1.66:8080'
  : 'https://your-production-url.com';

export const API_ENDPOINTS = {

  uploadProof: `${API_BASE_URL}/proofs`,
  generatePin: (proofId: string) => `${API_BASE_URL}/proofs/${proofId}/pin`,
  verifyPin: (pin: string) => `${API_BASE_URL}/verify/${pin}`,
  registerPublicKey: (workerId: string) => `${API_BASE_URL}/workers/${workerId}/public-key`

};

export const API_TIMEOUT_MS = 10000;
export const RATE_LIMIT_ATTEMPTS = 5;
export const RATE_LIMIT_LOCKOUT_MS = 300000; 
