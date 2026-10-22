# 적당항공

자연어로 물어보면("맛집투어하러 1박2일 평일에 일본 여행갈려는데 11월중에 싼 항공권 있나?") 적당한 항공권 후보를 찾아 추천하는 웹앱. 요구사항은 [PRD.md](PRD.md).

| 폴더 | 내용 |
|---|---|
| `web/` | Next.js 앱 (React 채팅 UI + API Routes). Vercel에 배포 |
| `web/supabase/migrations/` | Supabase 스키마 |
| `m0/` | 웹 검색 가격 정확도 검증 스크립트 (Python) |

## 배포 (Vercel + Supabase)

1. **Supabase 프로젝트 만들기** — [supabase.com](https://supabase.com)에서 새 프로젝트 (리전: Northeast Asia (Seoul) 권장)
2. **스키마 적용** — Supabase 대시보드 > SQL Editor에 `web/supabase/migrations/0001_init.sql` 내용을 붙여 실행
3. **초대코드 만들기** — 같은 SQL Editor에서:
   ```sql
   insert into invite_codes (code, name, daily_limit) values ('원하는-코드', '나', 20);
   ```
4. **Vercel 프로젝트 만들기** — [vercel.com/new](https://vercel.com/new)에서 이 GitHub 저장소를 Import
   - Root Directory: `web`
   - Framework: Next.js (자동 인식)
5. **환경변수** — Vercel 프로젝트 Settings > Environment Variables
   | 이름 | 값 |
   |---|---|
   | `ANTHROPIC_API_KEY` | Anthropic Console에서 발급 |
   | `SUPABASE_URL` | Supabase Project Settings > API > Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings > API > service_role (또는 secret) 키 |

   Vercel Marketplace의 Supabase 연동을 쓰면 Supabase 값은 자동으로 들어온다.
6. **Redeploy** — 환경변수를 넣은 뒤 Deployments에서 다시 배포

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
