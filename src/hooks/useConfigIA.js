import { useState, useEffect } from "react";
import { loadAjustes } from "../lib/db";
import { CONFIG_IA_POR_DEFECTO } from "../lib/configIA";

/**
 * La configuración de IA del espacio, releída con cada `pulso` —que sube
 * cuando el administrador la cambia desde otra pestaña o persona—.
 */
export function useConfigIA(pulso = 0) {
  const [config, setConfig] = useState(CONFIG_IA_POR_DEFECTO);
  useEffect(() => {
    let vivo = true;
    loadAjustes()
      .then((a) => { if (vivo && a) setConfig({ ...CONFIG_IA_POR_DEFECTO, ...a }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pulso]);
  return config;
}
