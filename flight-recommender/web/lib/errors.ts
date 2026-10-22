export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** RFC 9457 problem+json 응답 */
export function problem(status: number, detail: string): Response {
  return Response.json({ status, detail }, { status, headers: { "content-type": "application/problem+json" } });
}

export function toProblem(error: unknown): Response {
  if (error instanceof ApiError) {
    return problem(error.status, error.message);
  }
  console.error(error);
  return problem(500, "서버 오류가 발생했습니다.");
}
