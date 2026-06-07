import { useEffect, useMemo, useRef, useState } from 'react';

const BLACK_PALETTE_V2 = {
  version: 2,
  topColor: '#000000',
  bottomColor: '#000000',
  colors: ['#000000', '#000000']
};

export default function AppBackground({ palette = null }) {
  const activePalette = useMemo(
    () => (palette?.version === 2 ? palette : BLACK_PALETTE_V2),
    [palette]
  );
  const [layers, setLayers] = useState([{ id: 0, palette: activePalette }]);
  const layerIdRef = useRef(0);

  useEffect(() => {
    setLayers((currentLayers) => {
      const current = currentLayers[currentLayers.length - 1];
      if (
        current?.palette.topColor === activePalette.topColor
        && current?.palette.bottomColor === activePalette.bottomColor
      ) {
        return currentLayers;
      }

      layerIdRef.current += 1;
      return [...currentLayers.slice(-1), { id: layerIdRef.current, palette: activePalette }];
    });

    const cleanup = window.setTimeout(() => {
      setLayers((currentLayers) => currentLayers.slice(-1));
    }, 240);

    return () => window.clearTimeout(cleanup);
  }, [activePalette]);

  return (
    <div className="app-background" aria-hidden="true">
      {layers.map((layer, index) => (
        <div
          key={layer.id}
          className={`app-background-layer ${index === layers.length - 1 ? 'active' : ''}`}
          style={{
            '--photo-bg-top': layer.palette.topColor,
            '--photo-bg-bottom': layer.palette.bottomColor
          }}
        />
      ))}
    </div>
  );
}
