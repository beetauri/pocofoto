const BLACK_PALETTE = ['#000000', '#000000', '#000000'];

export default function AppBackground({ palette = null }) {
  const colors = palette?.colors?.length ? palette.colors : BLACK_PALETTE;
  const style = {
    '--photo-bg-color-1': colors[0] || BLACK_PALETTE[0],
    '--photo-bg-color-2': colors[1] || colors[0] || BLACK_PALETTE[1],
    '--photo-bg-color-3': colors[2] || colors[1] || colors[0] || BLACK_PALETTE[2]
  };

  return (
    <div className="app-background" style={style} aria-hidden="true" />
  );
}
