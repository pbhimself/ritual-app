alter function public.set_updated_at()
  set search_path = '';

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
