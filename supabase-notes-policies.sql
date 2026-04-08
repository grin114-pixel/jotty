-- 기존에 `supabase-schema.sql`만 실행한 경우: Supabase SQL Editor에서 이 파일만 실행해도 됩니다.
-- 메모 수정·삭제(API) 허용용 정책입니다.

drop policy if exists "Allow anonymous update jotty notes" on public.jotty_notes;
create policy "Allow anonymous update jotty notes"
  on public.jotty_notes
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "Allow anonymous delete jotty notes" on public.jotty_notes;
create policy "Allow anonymous delete jotty notes"
  on public.jotty_notes
  for delete
  to anon
  using (true);
