// Who may post a service request: guests (sent to sign in), clients, admins, and
// providers who also chose "Both". A provider-only account sees requests, not this.
export const canRequestService = user => !user || user.role !== 'provider' || Number(user.also_client) === 1;
