// La composición «Video»: su duración sale de public/datos.json (la escena).
import React from "react";
import { Composition, staticFile } from "remotion";
import { Video } from "./Video.jsx";

export const Raiz = () => (
  <Composition id="Video" component={Video} width={1080} height={1920} fps={30} durationInFrames={30} defaultProps={{ datos: null }}
    calculateMetadata={async () => {
      const datos = await (await fetch(staticFile("datos.json"))).json();
      return { durationInFrames: datos.total, fps: datos.fps, props: { datos } };
    }} />
);
