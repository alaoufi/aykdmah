// AYK-445 (the owner: «السطر الأسفل اكتبه حسب الحالة»): what the boxes chosen show, or why a box
// cannot work yet (no services, no request, no area). `meta`: { has_profession, has_area } from the board.
export function stateKey(on, asProvider, meta) {
  if (on.prof && meta?.has_profession === false) return asProvider ? 'home.filter_need_services' : 'home.filter_need_requests';
  if (on.area && meta?.has_area === false) return 'home.filter_need_area';
  if (on.prof && on.area) return asProvider ? 'home.filter_state_both_provider' : 'home.filter_state_both_requester';
  if (on.prof) return asProvider ? 'home.filter_state_prof_provider' : 'home.filter_state_prof_requester';
  if (on.area) return 'home.filter_state_area';
  return 'home.filter_none';
}
