import { useEffect, useMemo, useRef, useState } from 'react';

const BLACK_PALETTE_V2 = {
  version: 2,
  topColor: '#000000',
  bottomColor: '#000000',
  colors: ['#000000', '#000000']
};

const BLACK_SOURCE = {
  imageUrl: '',
  palette: BLACK_PALETTE_V2
};

function normalizeBackgroundSource(source) {
  return {
    imageUrl: typeof source?.imageUrl === 'string' ? source.imageUrl : '',
    palette: source?.palette?.version === 2 ? source.palette : BLACK_PALETTE_V2
  };
}

function sameSource(a, b) {
  return a?.imageUrl === b?.imageUrl
    && a?.palette.topColor === b?.palette.topColor
    && a?.palette.bottomColor === b?.palette.bottomColor;
}

export default function AppBackground({ source = null }) {
  const activeSource = useMemo(
    () => (source ? normalizeBackgroundSource(source) : BLACK_SOURCE),
    [source]
  );
  const [layers, setLayers] = useState([{ id: 0, source: activeSource }]);
  const layerIdRef = useRef(0);

  useEffect(() => {
    const addLayer = () => {
      setLayers((currentLayers) => {
        const current = currentLayers[currentLayers.length - 1];
        if (sameSource(current?.source, activeSource)) {
          return currentLayers;
        }

        layerIdRef.current += 1;
        return [...currentLayers.slice(-1), { id: layerIdRef.current, source: activeSource }];
      });
    };

    let cleanup = null;
    let cancelled = false;

    if (!activeSource.imageUrl || typeof Image === 'undefined') {
      addLayer();
      cleanup = window.setTimeout(() => {
        setLayers((currentLayers) => currentLayers.slice(-1));
      }, 240);
    } else {
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        addLayer();
        cleanup = window.setTimeout(() => {
          setLayers((currentLayers) => currentLayers.slice(-1));
        }, 240);
      };
      image.onerror = () => {};
      image.src = activeSource.imageUrl;
    }

    return () => {
      cancelled = true;
      if (cleanup) window.clearTimeout(cleanup);
    };
  }, [activeSource]);

  return (
    <div className="app-background" aria-hidden="true">
      {layers.map((layer, index) => (
        <div
          key={layer.id}
          className={`app-background-layer ${index === layers.length - 1 ? 'active' : ''}`}
          style={{
            '--photo-bg-image': layer.source.imageUrl
              ? `url(${JSON.stringify(layer.source.imageUrl)})`
              : 'none',
            '--photo-bg-top': layer.source.palette.topColor,
            '--photo-bg-bottom': layer.source.palette.bottomColor
          }}
        />
      ))}
    </div>
  );
}
