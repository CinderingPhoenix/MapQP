// Temporary store-review access. Remove this code after the review period.
export const REVIEW_LOGIN_CODE = 'REVIEW';

export function isReviewSession(code: string | null): boolean {
  return code === REVIEW_LOGIN_CODE;
}
