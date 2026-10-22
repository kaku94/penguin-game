import { z } from "zod";

export const SearchRequestSchema = z.object({
  question: z.string().trim().min(1, "질문을 입력해주세요").max(500, "500자 이하로 입력해주세요"),
});
