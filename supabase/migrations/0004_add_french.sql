-- =============================================================================
-- 0004_add_french.sql
-- Adding a language is a data change, not a logic change: nothing in the engine
-- needs to know French exists. See docs/ADDING_A_LANGUAGE.md.
-- =============================================================================

insert into public.languages (code, name_native, name_vi, name_en, tts_lang)
values ('fr', 'Français', 'Tiếng Pháp', 'French', 'fr-FR')
on conflict (code) do nothing;
