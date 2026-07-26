# GrassRoots 本番品質プラットフォーム実装計画

## 背景・目的

英国のグラスルーツ・ジュニアサッカークラブ向けに、保護者の次の行動、チーム運営、会場・ピッチ、コーチング、支払い、同意・セーフガーディングを一つのイベント基盤で扱う GrassRoots を構築する。最新ユーザー指示により、添付仕様の一時名 Pitchside ではなく **GrassRoots** を正式な初期ブランドとする。ただし名称・ロゴ・色・metadata は中央設定から差し替え可能にする。

外部認証情報がなくても架空 seed と開発 provider で主要導線を実行でき、本番では Supabase、Stripe、メール、push、SMS、WhatsApp Business、天気、OpenAI 等へ安全に差し替えられる構成にする。

## 現状整理・ベースライン

- ローカル `C:/Users/Gaming PC/Documents/GrassRoots` には `.agents/`、`docs/`、`PRODUCT.md`、`DESIGN.md`、`skills-lock.json` があり、アプリケーション、`package.json`、database、test は存在しない。
- ローカル `.git` は空ディレクトリで、`git status`、`git remote -v`、`git rev-parse` は `fatal: not a git repository`。既存履歴・branch・dirty app code はない。
- GitHub `https://github.com/AKLondon1/GrassRoots.git` は public、既定 branch `main`、HEAD `8be4a769b3ea7abaa8feb8c50bf52270ab511e12`、内容は README 一件のみ。
- application がないため baseline `install`、`lint`、`typecheck`、`unit test`、`build` は **not applicable**。scaffold 後の最初の green build を基準 commit にする。
- 最新 docs 調査: Next.js App Router では Server Action 内でも認証・認可を再検証する。Supabase SSR は server/browser client を分離し cookie `getAll/setAll` を実装する。RLS は `auth.uid()` と scoped membership/capability を組み合わせる。
- 物理利用シーンは「雨上がりのピッチ脇で 07:15、保護者が片手で次の行動を確認」。light、high-contrast、restrained teal を採用し、WCAG 2.2 AA、British English、Europe/London、GBP を既定値にする。

## 重要な前提・製品判断

1. 子どもは login しない。player profile と guardian/household の many-to-many 関係で代理操作する。adult-to-child DM は存在させない。
2. modular monolith を採用し、microservice 化しない。canonical `events` record を availability、poll、squad、booking、attendance、communication、payment の基準にする。
3. production data は Supabase/PostgreSQL + RLS。credential 未設定時は明示された local demo repository を利用し、本番連携済みと表示しない。
4. 全 tenant table は `organisation_id` を持ち、user の global role field を禁止する。capability は organisation/team/resource scope で解決する。
5. medical/safeguarding 本文は通常 table/analytics/cache から分離し、restricted server boundary と sensitive-access audit を通す。法務・FA・セーフガーディング審査は production launch gate とする。
6. Stripe test credential がない場合は manual/fake development provider を完全実装するが、Stripe test mode 完了とは表現しない。credential 追加後に contract/E2E を実行できる境界を用意する。
7. full brief は一度に露出せず、feature entitlement と role-aware navigation で段階提供する。実装順は添付仕様の六段階を維持する。

## 設計

### 技術スタック

- Next.js App Router + strict TypeScript + React Server Components
- Tailwind CSS、shadcn/Radix primitives、Lucide、Motion
- Zod、React Hook Form、server actions/route handlers
- Supabase PostgreSQL/Auth/Storage/Realtime/SSR、SQL migrations、RLS、generated types
- Vitest + Testing Library + fast-check、pgTAP/Supabase DB tests、Playwright + axe
- PWA manifest/service worker、安全な IndexedDB queue（非機密データのみ）
- Vercel + Supabase staging/production、environment validation、provider adapters

### ファイル構成

```text
C:/Users/Gaming PC/Documents/GrassRoots/
├── app/layout.tsx
├── app/globals.css
├── app/error.tsx
├── app/not-found.tsx
├── app/(public)/page.tsx
├── app/(public)/features/page.tsx
├── app/(public)/clubs/page.tsx
├── app/(public)/pricing/page.tsx
├── app/(public)/safeguarding/page.tsx
├── app/(public)/terms/page.tsx
├── app/(public)/privacy/page.tsx
├── app/(auth)/sign-in/page.tsx
├── app/(auth)/register-club/page.tsx
├── app/(auth)/invite/[token]/page.tsx
├── app/(auth)/respond/[token]/page.tsx
├── app/(workspace)/app/layout.tsx
├── app/(workspace)/app/[workspace]/page.tsx
├── app/(workspace)/app/[workspace]/[section]/page.tsx
├── app/api/calendar/[token]/route.ts
├── app/api/providers/stripe/webhook/route.ts
├── app/api/health/route.ts
├── components/ui/button.tsx
├── components/ui/field.tsx
├── components/ui/status.tsx
├── components/ui/skeleton.tsx
├── components/ui/empty-state.tsx
├── components/ui/error-state.tsx
├── components/ui/denied-state.tsx
├── components/ui/glowing-effect.tsx
├── components/ui/container-scroll.tsx
├── components/marketing/site-header.tsx
├── components/marketing/hero.tsx
├── components/marketing/product-showcase.tsx
├── components/marketing/feature-story.tsx
├── components/marketing/site-footer.tsx
├── components/shell/role-switcher.tsx
├── components/shell/side-navigation.tsx
├── components/shell/bottom-navigation.tsx
├── components/shell/command-menu.tsx
├── components/parent/action-centre.tsx
├── components/parent/next-event.tsx
├── components/parent/family-agenda.tsx
├── components/parent/availability-control.tsx
├── components/coaching/today-board.tsx
├── components/coaching/squad-selector.tsx
├── components/coaching/session-planner.tsx
├── components/coaching/match-timer.tsx
├── components/admin/club-overview.tsx
├── components/admin/pitch-planner.tsx
├── components/admin/finance-summary.tsx
├── components/admin/compliance-board.tsx
├── features/tenancy/types.ts
├── features/tenancy/permissions.ts
├── features/tenancy/service.ts
├── features/households/types.ts
├── features/households/schema.ts
├── features/households/service.ts
├── features/events/types.ts
├── features/events/schema.ts
├── features/events/recurrence.ts
├── features/events/service.ts
├── features/availability/schema.ts
├── features/availability/service.ts
├── features/polls/schema.ts
├── features/polls/recommendation.ts
├── features/polls/service.ts
├── features/squads/fairness.ts
├── features/squads/service.ts
├── features/facilities/conflicts.ts
├── features/facilities/alternatives.ts
├── features/facilities/service.ts
├── features/coaching/playing-time.ts
├── features/coaching/training.ts
├── features/coaching/service.ts
├── features/communications/notifications.ts
├── features/communications/service.ts
├── features/finance/money.ts
├── features/finance/service.ts
├── features/consent/schema.ts
├── features/consent/service.ts
├── features/safeguarding/permissions.ts
├── features/safeguarding/service.ts
├── lib/brand.ts
├── lib/navigation/screen-registry.ts
├── lib/demo/seed.ts
├── lib/demo/repository.ts
├── lib/demo/session.ts
├── lib/supabase/browser.ts
├── lib/supabase/server.ts
├── lib/supabase/middleware.ts
├── lib/supabase/types.ts
├── lib/providers/contracts.ts
├── lib/providers/email.ts
├── lib/providers/push.ts
├── lib/providers/sms.ts
├── lib/providers/whatsapp.ts
├── lib/providers/stripe.ts
├── lib/providers/weather.ts
├── lib/providers/maps.ts
├── lib/providers/scan.ts
├── lib/providers/ai.ts
├── lib/env.ts
├── lib/utils.ts
├── proxy.ts
├── public/manifest.webmanifest
├── public/sw.js
├── supabase/migrations/0001_identity_tenancy.sql
├── supabase/migrations/0002_people_households.sql
├── supabase/migrations/0003_events_polls_squads.sql
├── supabase/migrations/0004_facilities.sql
├── supabase/migrations/0005_coaching.sql
├── supabase/migrations/0006_comms_finance.sql
├── supabase/migrations/0007_consent_safeguarding_ops.sql
├── supabase/seed.sql
├── supabase/tests/tenancy.sql
├── supabase/tests/permissions.sql
├── supabase/tests/sensitive-access.sql
├── supabase/tests/pitch-conflicts.sql
├── tests/unit/recurrence.test.ts
├── tests/unit/availability.test.ts
├── tests/unit/polls.test.ts
├── tests/unit/households.test.ts
├── tests/unit/fairness.test.ts
├── tests/unit/pitch-conflicts.test.ts
├── tests/unit/booking-buffers.test.ts
├── tests/unit/pitch-alternatives.test.ts
├── tests/unit/playing-time.test.ts
├── tests/unit/money.test.ts
├── tests/unit/refunds.test.ts
├── tests/unit/qualifications.test.ts
├── tests/unit/consent.test.ts
├── tests/unit/permissions.test.ts
├── tests/unit/notification-scheduling.test.ts
├── tests/unit/calendar-tokens.test.ts
├── tests/unit/offline-conflicts.test.ts
├── tests/integration/club-setup.test.ts
├── tests/integration/invitation.test.ts
├── tests/integration/guardian-linkage.test.ts
├── tests/integration/multi-club-isolation.test.ts
├── tests/integration/organisation-deletion.test.ts
├── tests/integration/event-creation.test.ts
├── tests/integration/recurrence-edit-scopes.test.ts
├── tests/integration/availability.test.ts
├── tests/integration/poll-conversion.test.ts
├── tests/integration/squad-publication.test.ts
├── tests/integration/pitch-allocation.test.ts
├── tests/integration/pitch-closure.test.ts
├── tests/integration/training-attendance.test.ts
├── tests/integration/announcement-delivery.test.ts
├── tests/integration/stripe-webhook.test.ts
├── tests/integration/consent-recording.test.ts
├── tests/integration/restricted-access.test.ts
├── tests/integration/data-export.test.ts
├── tests/integration/account-deletion.test.ts
├── tests/integration/support-access.test.ts
├── tests/integration/providers.test.ts
├── tests/e2e/public.spec.ts
├── tests/e2e/parent.spec.ts
├── tests/e2e/coach.spec.ts
├── tests/e2e/club-admin.spec.ts
├── tests/e2e/pitch-admin.spec.ts
├── tests/e2e/treasurer.spec.ts
├── tests/e2e/welfare.spec.ts
├── tests/e2e/critical-flows.spec.ts
├── tests/security/cross-club.test.ts
├── tests/security/guardian-isolation.test.ts
├── tests/security/team-scope.test.ts
├── tests/security/medical-denial.test.ts
├── tests/security/coaching-note-denial.test.ts
├── tests/security/opposition-link.test.ts
├── tests/security/calendar-revocation.test.ts
├── tests/security/magic-link-expiry.test.ts
├── tests/security/stripe-forgery.test.ts
├── tests/security/sensitive-audit.test.ts
├── tests/security/upload-validation.test.ts
├── docs/ARCHITECTURE.md
├── docs/ERD.md
├── docs/AUTHORIZATION.md
├── docs/RLS.md
├── docs/NOTIFICATIONS.md
├── docs/PAYMENTS.md
├── docs/PITCH-CONFLICTS.md
├── docs/PWA-OFFLINE.md
├── docs/SECURITY-THREAT-MODEL.md
├── docs/SAFEGUARDING.md
├── docs/GDPR-READINESS.md
├── docs/PROVIDERS.md
├── docs/BACKUP-RESTORE.md
├── docs/DEPLOYMENT.md
├── docs/COMMERCIALISATION.md
├── docs/PROCESSOR-REGISTER.md
├── docs/DATA-BREACH-RESPONSE.md
├── docs/KNOWN-LIMITATIONS.md
├── PRODUCT.md
├── DESIGN.md
├── README.md
├── .env.example
├── package.json
├── package-lock.json
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
├── next.config.ts
├── playwright.config.ts
├── vitest.config.ts
├── supabase/config.toml
└── .github/workflows/ci.yml
```

### 具体画面ファイル所有

共通 route resolver は用いるが、各 screen family の振る舞い・test owner は以下の literal module に固定する。

```text
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/public/landing.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/public/features.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/public/clubs.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/public/pricing.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/public/safeguarding.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/public/terms.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/public/privacy.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/auth/sign-in.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/auth/register-club.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/auth/accept-invitation.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/auth/magic-response.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/home.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/action-centre.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/family-schedule.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/event-detail.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/availability.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/time-poll.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/squad-status.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/messages.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/announcements.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/payments.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/consents.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/child-profile.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/household.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/notifications.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/calendar-subscription.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/parent/help.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/today.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/team-dashboard.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/team-calendar.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/event-editor.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/availability.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/squad-selection.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/match-day.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/formation.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/playing-time.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/attendance.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/training-planner.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/drill-library.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/player-list.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/player-development.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/communication.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/coach/volunteers.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/overview.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/master-calendar.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/teams.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/seasons.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/people.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/invitations.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/venues.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/pitch-planner.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/pitch-inspections.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/maintenance.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/fixture-centre.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/opposition.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/payments.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/forms.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/consents.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/documents.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/equipment.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/compliance.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/safeguarding.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/reports.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/audit.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/settings.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/integrations.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/club/entitlements.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/platform/organisations.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/platform/plans.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/platform/feature-flags.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/platform/provider-usage.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/platform/system-health.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/platform/support-cases.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/platform/audited-access.tsx
C:/Users/Gaming PC/Documents/GrassRoots/features/screens/platform/analytics.tsx
C:/Users/Gaming PC/Documents/GrassRoots/tests/e2e/screens/public-screens.spec.ts
C:/Users/Gaming PC/Documents/GrassRoots/tests/e2e/screens/parent-screens.spec.ts
C:/Users/Gaming PC/Documents/GrassRoots/tests/e2e/screens/coach-screens.spec.ts
C:/Users/Gaming PC/Documents/GrassRoots/tests/e2e/screens/club-screens.spec.ts
C:/Users/Gaming PC/Documents/GrassRoots/tests/e2e/screens/platform-screens.spec.ts
```

### 画面レジストリ

`lib/navigation/screen-registry.ts` に、各 role の URL、label、capability、component kind、loading/empty/error/denied copy を列挙する。`[workspace]/[section]` route は registry を解決し、未知 section は 404、権限不足は denied state とする。

- Parent: home, actions, schedule, event, availability, polls, squad, messages, announcements, payments, consents, child, household, notifications, calendar, help。
- Coach/manager: today, team, calendar, event editor, availability, squad, match-day, formation, playing-time, attendance, training, drills, players, development, compose, volunteers。
- Club: overview, calendar, teams, seasons, people, invitations, venues, pitch-planner, inspections, maintenance, fixtures, opposition, payments, forms, consents, documents, equipment, compliance, safeguarding, reports, audit, settings, integrations, entitlements。
- Platform: organisations, plans, feature-flags, provider-usage, health, support, audited-access, analytics。

## 受入基準

- **AC-01 Club setup:** club admin が club、season、U7 team、venue/sub-pitches を作成し、manager invite、CSV people import、guardian accept まで進めると demo/DB に同一 organisation scope で保存される。
- **AC-02 Parent availability:** guardian が expiring token または account から fixture を開き Available/Unavailable/Unsure を送信すると、manager totals と family schedule が更新される。
- **AC-03 Time poll:** manager が三候補を作り、parent/coach 回答と pitch capacity を比較して候補を event series に変換すると calendar/feed が更新される。
- **AC-04 Pitch allocation:** pitch admin が未割当 event を full pitch の subdivision に置くと overlap/buffer/suitability conflict が検出され、accessible alternative picker で有効候補を確定できる。
- **AC-05 Squad:** manager が availability と fairness panel から selected/standby を publish し、withdrawal 後に standby replacement を受諾させると parent status が中立表現で更新される。
- **AC-06 Training:** coach が segments/drills の session plan を共有し、mobile attendance と private positive observation を記録すると reviewed parent summary のみ guardian に見える。
- **AC-07 Match day:** coach が period/substitution/position を操作し、refresh 後も timestamp から minutes を復元して reflection と positive summary を保存できる。
- **AC-08 Cancellation:** inspection closure が affected events を列挙し、cancel/relocate 後に redacted urgent notification と calendar update を作る。
- **AC-09A Payments demo:** credential なしで treasurer が household request、manual/dev payment、receipt、gross/fee/net reconciliation を確認でき、UI が dev mode を明示する。
- **AC-09B Stripe test mode:** Stripe test credential を設定した環境で signed/idempotent webhook、card payment、receipt、refund、reconciliation が成功する。credential 不在時は blocked と記録し、AC-09B を完了扱いにしない。
- **AC-10 Safeguarding:** ordinary coach の restricted concern access は拒否され、welfare officer の reasoned access は sensitive log に残り、notification/analytics に本文が出ない。
- **AC-11 Roles/screens:** parent、coach、club admin、pitch admin、fixture secretary、treasurer、welfare、opposition、platform owner の navigation と全 required screen family が capability に従い loading/empty/error/denied を表示する。
- **AC-12 Households/privacy:** child account を作らず、multiple children/guardians/clubs、guardian communication/payment/consent flags、restricted-contact confidentiality、cross-household/cross-club denial をテストする。
- **AC-13 PWA/offline:** installable manifest、offline fallback、schedule/event cache、attendance/match queue が動作し、medical/safeguarding/payment bodies は offline cache されない。
- **AC-14 Providers:** email/push/SMS/WhatsApp/maps/weather/scan/analytics/AI は共通 contract と dev adapter を持ち、credential 未設定時は production 完了と表示しない。
- **AC-15 Operations/data rights:** audit、search/export permission、data export/correction/deletion、retention、session revocation、rate limit、upload validation、backup/restore/runbook、health instrumentation が存在する。
- **AC-16 Quality:** public と各 role の mobile/tablet/desktop journey が keyboard/axe/visual check を通り、lint/type/unit/integration/permission/E2E/build が 0 exit code。

## 実装ステップ

### Phase 1: Foundation

- **T1.1 Repo/scaffold:** GitHub main を接続し、Next.js、Tailwind、lint/type/test/PWA scripts、secure headers、env schema、brand config を作成。Gate: clean baseline build。
- **T1.2 Design/system:** PRODUCT/DESIGN tokens、UI states、shells、role switcher、screen registry、glowing/container-scroll marketing primitives。Gate: component tests + responsive shell smoke。
- **T1.3 Tenancy/auth:** `0001` migration、Supabase SSR boundary、organisation membership、scoped capability、session/invite tokens、demo session。Gate: cross-org permission DB/unit tests。
- **T1.4 People/seed:** `0002` migration、players/guardians/households/teams/seasons、guardian flags、fictional demo roles/data、CSV validation/import preview。Gate: AC-01/12 integration tests。

### Phase 2: Essential Teamer replacement

- **T2.1 Event engine:** `0003` migration、event series/instances/exceptions、agenda/calendar、ICS/private revocable feeds、event change summaries。
- **T2.2a Public/auth:** landing/features/clubs/pricing/safeguarding/legal、sign-in/register/invitation/magic-response。
- **T2.2b Parent schedule/actions:** home/actions/family schedule/event、availability token/account、calendar subscription。
- **T2.2c Parent account/comms:** messages/announcements/payments/consents/child/household/preferences/help。
- **T2.3a Manager events:** Today/team/calendar/event editor、availability dashboard、recurrence edit scopes。
- **T2.3b Poll/squad:** poll recommendation/conversion、fairness、selection、standby replacement。
- **T2.3c Fixture/opposition:** opposition directory、limited secure link、fixture state/history/rearrangement。
- **T2.4 Notification engine:** outbox/dedupe/quiet hours/household collapse、dev email、push contract、weekly digest。Gate: AC-02/03/05 and notification integration tests。

### Phase 3: Pitch and club operations

- **T3.1 Facilities schema/domain:** `0004` migration、venue/facility/pitch hierarchy、atomic reservation units、range/buffer conflicts、alternative scoring。
- **T3.2 Planner/fixtures:** accessible planner、unallocated queue、inspection/closure、maintenance、opposition directory、fixture state/history。
- **T3.3a Club directory:** club overview/master calendar/teams/seasons/people/invitations/imports。
- **T3.3b Knowledge/assets:** role-aware search/command menu、documents/versioning、equipment/kit/reservations、volunteer rota。
- **T3.3c Reporting/support:** team/club reports、permissioned CSV/PDF exports、watermark/audit、support requests/audited support session。
- **T3.3d Operations gate:** AC-04/08、conflict concurrency、search leakage、export permission tests。

### Phase 4: Coaching

- **T4.1 Training:** `0005` migration、session segments、drill library、templates、attendance/offline queue、private observations/objectives/reviewed summaries。
- **T4.2 Match day:** formation/period state、timestamp-based timer、substitution/position/goalkeeper tracking、playing-time calculation、reflection/positive summary。
- **T4.3 AI boundary:** OpenAI official structured-output guidanceに沿う feature-flagged provider contract、editable proposal、cost log、no-op disabled default。Gate: AC-06/07 provider contract and offline recovery tests。

### Phase 5: Safeguarding and finance

- **T5.1 Consent/compliance:** `0007` migration、versioned consent/withdrawal、forms/docs、qualification expiry、emergency minimal access、restricted safeguarding workflow/audit。
- **T5.2 Finance:** `0006` migration、minor-unit money、payment assignments/invoices/plans/refunds/manual reconciliation、Stripe signed/idempotent webhook boundary、CSV/receipts。
- **T5.3a Platform admin:** organisations、plans、feature flags、provider usage、health、support cases、aggregate analytics、audited support access。
- **T5.3b Commercial lifecycle:** organisation signup/trial、usage metering、founding entitlement、custom branding、terms/privacy acceptance、ownership transfer、organisation export/deletion。
- **T5.3c Billing separation:** member payment ledger と platform subscription billing を別 bounded context/table/provider に分離する。
- **T5.3d Gate:** AC-09A/09B/10、finance、webhook、organisation lifecycle、permission tests。

### Phase 6: Hardening

- **T6.1a Request security:** rate limits、CSRF/origin、CSP/headers、session revocation/lock/suspension、token expiry/replay。
- **T6.1b Files/data:** signed uploads、MIME/magic-byte/size/quarantine、data export/correction/deletion/anonymisation、retention jobs。
- **T6.1c Privacy/operations:** log redaction、audit、processor register、data-breach response、backup/restore procedure、monitoring/error references。
- **T6.2 PWA/performance:** service worker/update flow、safe caches/queues、pagination/indexes、virtualised admin lists where needed、performance/health instrumentation。
- **T6.3 Documentation:** README と全 architecture/RLS/provider/security/GDPR/offline/backup/deployment/commercialisation/limitations docs、ERD。
- **T6.4a DB/security QA:** Supabase reset、pgTAP、RLS/permission/storage/realtime、forged token/webhook/upload tests。
- **T6.4b Journey QA:** ten critical flows、all role screen families、mobile/tablet/desktop Playwright。
- **T6.4c Visual/a11y QA:** axe/keyboard、drag alternatives、screenshots、overflow、focus、reduced motion。
- **T6.4d Release QA:** clean install、lint、strict types、all tests、production build、requirements checklist。Gate: AC-11〜16。

## ソース要件カバレッジ

| 添付仕様 | 実装タスク・受入基準 |
|---|---|
| §2–6 scope/tenancy/roles | T1.3, T1.4, T5.3a, T5.3b, T5.3c, T5.3d; AC-11, AC-12 |
| §7 parent | T2.2b, T2.2c; AC-02, AC-11, AC-12 |
| §8–9 setup/people | T1.4; AC-01, AC-12 |
| §10–13 events/polls/availability/squads | T2.1, T2.2b, T2.3a, T2.3b; AC-02, AC-03, AC-05 |
| §14 facilities | T3.1, T3.2; AC-04, AC-08 |
| §15–17 coaching/match | T4.1–T4.3; AC-06, AC-07 |
| §18–19 opposition/comms | T2.3c, T2.4, T3.2; AC-03, AC-08, AC-14 |
| §20 finance | T5.2, T5.3c, T5.3d; AC-09A, AC-09B |
| §21–24 forms/safety/equipment/volunteers | T3.3b, T3.3c, T3.3d, T5.1; AC-10, AC-15 |
| §25–27 reports/search/IA | T1.2, T3.3b, T3.3c, T3.3d; AC-11, AC-15 |
| §28–30 UX/PWA/notifications | T1.2, T2.4, T6.2; AC-13, AC-16 |
| §31–35 data/RLS/security/GDPR/admin | T1.3, T5.1, T6.1a, T6.1b, T6.1c, T6.3; AC-10, AC-12, AC-15 |
| §36–38 commercial/seed/screens | T1.4, T5.3a, T5.3b, T5.3c, T5.3d, T1.2; AC-11, AC-14 |
| §39 ten flows | T1.4, T2.2a, T2.2b, T2.2c, T2.3a, T2.3b, T2.3c, T2.4, T3.2, T4.1, T4.2, T5.1, T5.2, T6.4a, T6.4b, T6.4c, T6.4d; AC-01–AC-08, AC-09A, AC-09B, AC-10 |
| §40–41 tests/performance | T6.2, T6.4a, T6.4b, T6.4c, T6.4d; AC-16 |
| §42 docs | T6.3; AC-15 |
| §43 phases | Phase 1–6 in specified order |
| §44 DoD | AC-01–AC-08, AC-09A, AC-09B, AC-10–AC-16, T6.4a, T6.4b, T6.4c, T6.4d |
| §45 final report | final handoff after T6.4d |

## Migration・table 所有マトリクス

| Migration | 所有 table family | 実装 task | DB test |
|---|---|---|---|
| `0001_identity_tenancy.sql` | profiles, organisations, memberships, roles, permissions, role_permissions, scoped assignments, settings, entitlements, seasons | T1.3 | `tenancy.sql`, `permissions.sql` |
| `0002_people_households.sql` | age_groups, teams, team_memberships, players, guardians, households, player_guardians, guardian_permissions, coaches, volunteers, opposition people | T1.4 | guardian linkage/cross-household tests |
| `0003_events_polls_squads.sql` | events, teams, recurrence, changes, availability, attendance/staff, squads/history/standby, transport, calendar tokens, polls/options/respondents/responses | T2.1, T2.2b, T2.3a, T2.3b | recurrence scopes, token revocation, squad permissions |
| `0004_facilities.sql` | venues, facilities, pitches, relationships, bookings/buffers/blocks, inspections, maintenance, assets, external hires | T3.1–T3.2 | `pitch-conflicts.sql`, closure/concurrency tests |
| `0005_coaching.sql` | training sessions/segments, drills/tags, session drills, observations/objectives, position periods, playing time, match periods/events/reflections | T4.1–T4.2 | attendance, timer recovery, privacy tests |
| `0006_comms_finance.sql` | announcements/recipients, conversations/members/messages/reports, notification prefs/deliveries/logs/subscriptions, member payments/invoices/refunds/reconciliation, platform billing/usage, Stripe records | T2.4, T5.2, T5.3c | notification scheduling, messaging boundaries, webhook idempotency/forgery |
| `0007_consent_safeguarding_ops.sql` | consent definitions/versions/responses, medical/emergency, concerns/actions, checks/qualifications, policies/acks/sensitive logs, equipment/kit/tasks, files/audit/import/export/support/flags/jobs/retention | T3.3b, T3.3c, T3.3d, T5.1, T6.1a, T6.1b, T6.1c | `sensitive-access.sql`, export/deletion/support tests |

## Test coverage マトリクス

| Brief §40 category | Literal test files |
|---|---|
| Unit calculations | `tests/unit/availability.test.ts`, `polls.test.ts`, `recurrence.test.ts`, `households.test.ts`, `fairness.test.ts`, `playing-time.test.ts`, `pitch-conflicts.test.ts`, `booking-buffers.test.ts`, `pitch-alternatives.test.ts`, `money.test.ts`, `refunds.test.ts`, `qualifications.test.ts`, `consent.test.ts`, `permissions.test.ts`, `notification-scheduling.test.ts`, `calendar-tokens.test.ts`, `offline-conflicts.test.ts` |
| Integration tenancy/people | `tests/integration/club-setup.test.ts`, `invitation.test.ts`, `guardian-linkage.test.ts`, `multi-club-isolation.test.ts`, `organisation-deletion.test.ts` |
| Integration event/squad/pitch | `event-creation.test.ts`, `recurrence-edit-scopes.test.ts`, `availability.test.ts`, `poll-conversion.test.ts`, `squad-publication.test.ts`, `pitch-allocation.test.ts`, `pitch-closure.test.ts`, `training-attendance.test.ts` |
| Integration comms/finance/privacy | `announcement-delivery.test.ts`, `stripe-webhook.test.ts`, `consent-recording.test.ts`, `restricted-access.test.ts`, `data-export.test.ts`, `account-deletion.test.ts`, `support-access.test.ts` |
| E2E role/viewports | `tests/e2e/public.spec.ts`, `parent.spec.ts`, `coach.spec.ts`, `club-admin.spec.ts`, `pitch-admin.spec.ts`, `treasurer.spec.ts`, `welfare.spec.ts`, `critical-flows.spec.ts` across Playwright mobile/tablet/desktop projects |
| Security | `tests/security/cross-club.test.ts`, `guardian-isolation.test.ts`, `team-scope.test.ts`, `medical-denial.test.ts`, `coaching-note-denial.test.ts`, `opposition-link.test.ts`, `calendar-revocation.test.ts`, `magic-link-expiry.test.ts`, `stripe-forgery.test.ts`, `sensitive-audit.test.ts`, `upload-validation.test.ts` |

## 受入基準トレーサビリティ

| 受入基準 | 実装 | 検証 |
|---|---|---|
| AC-01 | T1.4 | `tests/integration/club-setup.test.ts`, critical flow 1 |
| AC-02 | T2.1, T2.2b | availability integration, critical flow 2 |
| AC-03 | T2.1, T2.2b, T2.3a, T2.3b | poll unit/integration, critical flow 3 |
| AC-04 | T3.1, T3.2 | DB/domain conflict tests, critical flow 4 |
| AC-05 | T2.3b | fairness/squad tests, critical flow 5 |
| AC-06 | T4.1 | training/attendance tests, critical flow 6 |
| AC-07 | T4.2 | playing-time recovery tests, critical flow 7 |
| AC-08 | T2.4, T3.2 | closure notification test, critical flow 8 |
| AC-09A | T5.2 | money/dev-provider tests, critical flow 9 demo branch |
| AC-09B | T5.2, T5.3c | signed Stripe test webhook/card/refund/reconciliation E2E; credential required |
| AC-10 | T5.1, T6.1a, T6.1b, T6.1c | permission/audit tests, critical flow 10 |
| AC-11 | T1.2, T2.2a, T2.2b, T2.2c, T2.3a, T2.3b, T2.3c, T2.4, T3.1, T3.2, T3.3a, T3.3b, T3.3c, T3.3d, T4.1, T4.2, T4.3, T5.1, T5.2, T5.3a, T5.3b, T5.3c, T5.3d | role route Playwright projects |
| AC-12 | T1.3, T1.4 | RLS/permission/household tests |
| AC-13 | T4.1, T4.2, T6.2 | offline/PWA Playwright tests |
| AC-14 | T2.4, T4.3, T5.2 | provider contract tests |
| AC-15 | T3.3b, T3.3c, T3.3d, T6.1a, T6.1b, T6.1c, T6.3 | security/data-rights/docs checklist |
| AC-16 | T6.4a, T6.4b, T6.4c, T6.4d | complete verification command set |

## 並列実行戦略

- Gate A: T1.1–T1.3 の shared config、types、schema を serial ownership で確定する。migration 番号と `package.json` は root agent のみ変更。
- Gate B 後: read-only domain research と independent UI review は並列化可能。application implementation は subagent-driven workflow に従い、同時編集を避けて task ごとに実装→spec/code review→統合する。
- Feature ownership: parent (`components/parent`, T2.2b, T2.2c)、coaching (`components/coaching`, T4.1, T4.2, T4.3)、facilities/admin (`components/admin`, T3.1, T3.2, T3.3a, T3.3b, T3.3c, T3.3d)、domain tests (`features/*`, `tests/unit`) を分離する。
- Integration points: `screen-registry.ts`、`brand.ts`、Supabase types、provider contracts は task 開始時に interface freeze。変更は root agent が serial に統合する。
- Final Gate: 全 migration、permission matrix、ten flows、role/viewport E2E を統合後に一括実行する。

## 検証方法

```powershell
npm ci                                  # exit 0; lockfile reproducible install
npx supabase db reset                   # exit 0; all migrations + fictional seed
npx supabase test db                    # exit 0; pgTAP/RLS/permission tests
npm run lint                            # exit 0; no disabled rules used as bypass
npm run typecheck                       # exit 0; strict TypeScript, no errors
npm run test:unit                       # exit 0; domain calculations
npm run test:integration                # exit 0; services/providers/data flows
npm run test:permissions                # exit 0; cross-club/role/sensitive denial
npm run test:a11y                       # exit 0; axe + keyboard smoke
npm run test:e2e                        # exit 0; roles, viewports, ten flows
npm run build                           # exit 0; Next.js production build
```

Supabase CLI/Docker が現在利用不可なら、環境を CI または利用可能な local runner に移して `db reset` と pgTAP/RLS suite を実行するまで AC-16 と completion を blocked とする。Playwright は 390×844、768×1024、1440×1000 で screenshot、horizontal overflow、focus、reduced motion を検査する。provider credential がない contract は dev adapter で検証するが、AC-09B と production network success を主張しない。

## 文書成果物

- `README.md`: repository structure、local setup、env、migration/seed/test/run。
- `docs/ARCHITECTURE.md`, `docs/ERD.md`: modular monolith、canonical event、data model。
- `docs/AUTHORIZATION.md`, `docs/RLS.md`: auth、capabilities、tenant/storage/realtime boundaries。
- `docs/NOTIFICATIONS.md`, `docs/PAYMENTS.md`, `docs/PROVIDERS.md`: adapters、idempotency、credential/cost setup。
- `docs/PITCH-CONFLICTS.md`, `docs/PWA-OFFLINE.md`: algorithms、accessible alternative、sensitive-cache policy。
- `docs/SECURITY-THREAT-MODEL.md`, `docs/SAFEGUARDING.md`, `docs/GDPR-READINESS.md`: threat、legal-review gates、data rights/retention。
- `docs/PROCESSOR-REGISTER.md`, `docs/DATA-BREACH-RESPONSE.md`: processor/owner/legal basis/retention と発見・封じ込め・通知・事後レビュー手順。
- `docs/BACKUP-RESTORE.md`, `docs/DEPLOYMENT.md`, `docs/COMMERCIALISATION.md`, `docs/KNOWN-LIMITATIONS.md`: operations、staging/production、entitlements、unfinished external activation。

## 将来の拡張・production gate

production 公開前に legal/FA/safeguarding review、real provider credentials、malware scanner、monitoring、backup restore drill、incident owner、Stripe Connect onboarding が必要。processor register と data-breach response は repository deliverable として実装し、実運用 owner/契約情報は launch 時に補完する。これらはコードの green build だけでは完了扱いにしない。
