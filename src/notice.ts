/** Reader-facing wording for sensitivity codes. The pack's editor notes never reach this map. */
const READER_NOTICES: Record<string, string> = {
  'ancestors-aboriginal': 'Aboriginal ancestral remains.',
  genocide: 'This place records a genocide.',
  uluru: 'Anangu ask that these stories stay with them.',
  'ancestors-maori': 'Ancestral Māori remains.',
  owners: 'Gunditjmara Country.',
  colonial: 'A colonial encounter, from the Gweagal perspective.',
  massacre: 'This place records a massacre.',
  atrocity: 'This place records a mass atrocity.',
  enslavement: 'This route records enslavement.',
  notice: 'This entry asks for care.',
};

export function readerNotice(code: string | null | undefined): string {
  if (!code) return '';
  return READER_NOTICES[code] ?? 'This entry asks for care.';
}
