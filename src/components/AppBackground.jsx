const BLACK_PALETTE_V2 = {
  version: 2,
  topColor: '#000000',
  bottomColor: '#000000',
  colors: ['#000000', '#000000']
};

export default function AppBackground({ palette = null }) {
  const activePalette = palette?.version === 2 ? palette : BLACK_PALETTE_V2;
  const style = {
    '--photo-bg-top': activePalette.topColor,
    '--photo-bg-bottom': activePalette.bottomColor
  };

  return (
    <div className="app-background" style={style} aria-hidden="true" />
  );
}
