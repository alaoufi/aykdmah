// AYK-445 (the owner: «السطر الأسفل اكتبه حسب الحالة»): what the boxes chosen show, or why a box
// cannot work yet (no services, no request, no area). `meta`: { has_profession, has_area } from the board.
// AYK-446 (the owner: «مشابه لطلبي، أو مشابه لطلباتي إذا له أكثر من طلب»).
// AYK-447: no request yet: the number of sections he chose.
export const many = meta => Number(meta?.my_requests) > 1 || (Number(meta?.my_requests) === 0 && Number(meta?.my_interests) > 1);
export function requestsLabel(meta) { return many(meta) ? 'home.filter_similar_many' : 'home.filter_similar_one'; }

export function stateKey(on, asProvider, meta) {
  if (on.prof && meta?.has_profession === false) return asProvider ? 'home.filter_need_services' : 'home.filter_need_sections';
  if (on.area && meta?.has_area === false) return 'home.filter_need_area';
  if (on.prof && on.area) return asProvider ? 'home.filter_state_both_provider' : many(meta) ? 'home.filter_state_both_requests' : 'home.filter_state_both_request';
  if (on.prof) return asProvider ? 'home.filter_state_prof_provider' : many(meta) ? 'home.filter_state_prof_requests' : 'home.filter_state_prof_request';
  if (on.area) return 'home.filter_state_area';
  return 'home.filter_none';
}
