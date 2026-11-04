// Browser history length includes unrelated sites. React Router's idx counts
// only entries in this router session; a direct link starts at zero.
export const adminBackTarget = state => Number.isInteger(state?.idx) && state.idx > 0 ? -1 : '/admin';
