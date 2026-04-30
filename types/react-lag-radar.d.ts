declare module "react-lag-radar" {
  import type { ComponentType } from "react";
  interface RadarProps {
    frames?: number;
    speed?: number;
    size?: number;
    inset?: number;
  }
  const Radar: ComponentType<RadarProps>;
  export default Radar;
}
