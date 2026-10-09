// The GrowIt mark: the halftone arrow from the logo, cut to a small rounded square (public/growit-mark.png).
// The full logo with the wordmark is public/growit-logo.svg and .png, used by the intro.
const Logo = ({ size = 28, className = '' }) => (
  <img src="/growit-mark.png" alt="" width={size} height={size} draggable="false" className={`shrink-0 select-none ${className}`} style={{ width: size, height: size }} />
);

export default Logo;
