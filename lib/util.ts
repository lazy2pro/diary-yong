// 알 수 없는 에러 객체에서 사람이 읽을 메시지를 안전하게 뽑아낸다.
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
