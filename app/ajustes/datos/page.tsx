"use client";

import { Apartado } from "@/components/ajustes-ui";
import { BackupPanel } from "@/components/backup-panel";

export default function AjustesDatos() {
  return (
    <Apartado titulo="Tus datos">
      <BackupPanel />
      <p className="text-xs leading-relaxed text-faint">
        Lo que registras vive en este móvil. Si has conectado tu cuenta, además se
        guarda una copia privada. Lilaila no es un dispositivo médico ni un
        método anticonceptivo.
      </p>
    </Apartado>
  );
}
