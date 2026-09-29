-- Sign-in uses email or Google. Usernames remain profile display identifiers.
revoke execute on function public.email_for_username(text) from public, anon, authenticated;
