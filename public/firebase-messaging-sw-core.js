(function initPocofotoMessaging(globalScope) {
  const EVENT_CACHE = 'pocofoto-push-events-v1';
  const MAX_EVENTS = 50;

  function parsePushData(data = {}) {
    return {
      eventId: data.eventId || `${data.type || 'unknown'}:${data.photoId || data.requestId || Date.now()}`,
      type: data.type || 'unknown',
      title: data.title || 'Pocofoto',
      body: data.body || 'You have a new Pocofoto update.',
      photoId: data.photoId || '',
      requestId: data.requestId || '',
      link: data.link || '/'
    };
  }

  function destinationFor(event) {
    if (['pairing_request', 'pairing_accepted', 'pairing_removed'].includes(event.type)) {
      return '/?pairing=requests';
    }
    if ((event.type === 'photo_received' || event.type === 'like_received') && event.photoId) {
      return `/?notification=photo&photoId=${encodeURIComponent(event.photoId)}`;
    }
    return event.link || '/';
  }

  function notificationOptions(event) {
    return {
      body: event.body,
      icon: '/pocoface-192.png',
      badge: '/pocoface-192.png',
      tag: event.eventId,
      data: {
        eventId: event.eventId,
        type: event.type,
        photoId: event.photoId,
        requestId: event.requestId,
        destination: destinationFor(event)
      }
    };
  }

  async function rememberEvent(eventId, cachesApi = caches) {
    const cache = await cachesApi.open(EVENT_CACHE);
    const request = new Request(`/__pocofoto_push_event__/${encodeURIComponent(eventId)}`);
    if (await cache.match(request)) return false;
    await cache.put(request, new Response(String(Date.now())));
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_EVENTS)).map((key) => cache.delete(key)));
    return true;
  }

  globalScope.PocofotoMessaging = {
    parsePushData,
    destinationFor,
    notificationOptions,
    rememberEvent
  };
})(self);
