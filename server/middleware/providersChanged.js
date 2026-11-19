// After a successful sign-up or provider/role change, open screens are told to refresh
// their "available now" lists (AYK-078). Bursts are merged into one event.
let timer = null;
module.exports = function providersChanged(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const io = req.app.get('io');
    if (!io || timer) return;
    timer = setTimeout(() => { timer = null; io.emit('providers:changed'); }, 2000);
  });
  next();
};
