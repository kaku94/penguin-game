# 적당항공

자연어로 물어보면("맛집투어하러 1박2일 평일에 일본 여행갈려는데 11월중에 싼 항공권 있나?") 적당한 항공권 후보를 찾아 추천하는 웹앱. 요구사항은 [PRD.md](PRD.md).

| 폴더 | 내용 |
|---|---|
| `web/` | Next.js 앱 (React 채팅 UI + API Routes). Vercel에 배포 |
| `m0/` | 웹 검색 가격 정확도 검증 스크립트 (Python) |

## 배포 (Vercel + Supabase)

1. **Vercel 프로젝트 만들기** — [vercel.com/new](https://vercel.com/new)에서 이 GitHub 저장소를 Import
   - Root Directory: `web`
   - Framework: Next.js (자동 인식)
2. **Supabase 연결** — 프로젝트의 Storage(또는 Import 화면의 Optional Integrations)에서 Supabase 추가. `POSTGRES_URL` 등이 자동으로 들어온다
3. **환경변수** — Vercel 프로젝트 Settings > Environment Variables
   | 이름 | 값 |
   |---|---|
   | `ANTHROPIC_API_KEY` | Anthropic Console에서 발급 |
   | `INVITE_CODES` | 초대코드 목록. `코드:이름:일일한도`를 쉼표로 구분 (예: `my-code:나:20,friend-code:친구`) |
4. **Redeploy** — 환경변수를 넣은 뒤 Deployments에서 다시 배포

> Vercel Hobby 플랜은 최신 커밋의 작성자 이메일이 Vercel 계정과 연결된 GitHub 계정의 것이어야 배포한다. 배포가 Blocked 되면 GitHub noreply 이메일(`ID+아이디@users.noreply.github.com`)로 커밋한다.

테이블은 서버가 처음 DB를 쓸 때 자동으로 만들어지고(`web/lib/schema.ts`), `INVITE_CODES`의 코드도 그때 등록된다. 모든 테이블은 RLS로 막혀 있어 서버의 직접 연결로만 접근된다.

배포 후 `/` 가 채팅 화면, `/docs` 가 Swagger UI.

## 로컬 개발

```bash
cd web
cp .env.example .env.local   # 값 채우기
npm install
npm run dev                  # http://localhost:3000
npm test
```

Windows에서 시스템에 Node가 없으면 `web/dev.ps1` 이 `.tools/` 의 포터블 Node로 실행한다.
