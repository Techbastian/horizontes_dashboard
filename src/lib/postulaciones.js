// Proyección de una postulación (`project_applications`) con lo que el equipo
// mira de ella: nombre, fase de selección, puntajes y en qué terminó.
//
// Vive aquí, en plain .js, porque la usan dos consumidores que no deben
// desincronizarse: la tabla de /candidatos y la exportación a Excel. Cuando esto
// estaba dentro del componente, cualquier cambio de criterio (qué es "elegible",
// de dónde sale el nivel) solo llegaba a la pantalla y no al archivo.
//
// Buena parte del estado vive en `custom_answers.seguimiento_fases`, no en
// columnas propias: ver la sección de columnas JSON en CLAUDE.md.

export function enriquecerPostulaciones(applications = [], enrollments = []) {
  // Seleccionados activos hoy. `estado_activo === true` (y no `!== false`) es
  // deliberado: aquí interesa quien está confirmado en el programa.
  const enrolledSet = new Set(
    enrollments
      .filter((e) => e.custom_form_data?.estado_activo === true)
      .map((e) => e.candidate?.id)
      .filter(Boolean)
  );

  // candidate_id → custom_form_data, para el nivel de selección. Se excluyen los
  // que nunca fueron elegidos (`elegido === false`): son matrículas heredadas.
  const enrollmentMap = new Map();
  enrollments.forEach((e) => {
    if (e.candidate?.id && e.custom_form_data?.elegido !== false) {
      enrollmentMap.set(e.candidate.id, e.custom_form_data || {});
    }
  });

  return applications.map((app) => {
    const ca = app.custom_answers || {};
    const fases = ca.seguimiento_fases || {};
    const isRejected = fases.elegibilidad === 'rejected';

    const pFase2 = typeof fases.puntaje_tecnico === 'number' ? fases.puntaje_tecnico : null;
    let pFase3 = null;
    if (typeof fases.puntaje_entrevista === 'number') {
      pFase3 = fases.puntaje_entrevista;
    } else if (fases.puntaje_entrevista === '0' || fases.puntaje_entrevista === 0) {
      pFase3 = 0;
    }

    return {
      ...app,
      fullName: `${app.candidate?.first_name || ''} ${app.candidate?.last_name || ''}`.trim(),
      documentNumber: app.candidate?.document_number || '',
      grupo: fases.grupo_asignado || 'Sin asignar',
      elegibilidadStatus: isRejected ? 'No elegible' : 'Elegible',
      isRejected,
      // A quien no pasó la fase 1 no se le muestran puntajes: los que trae son
      // ruido de arrastre, no una evaluación real.
      puntajeTecnico: isRejected ? null : pFase2,
      puntajeActitudinal: isRejected ? null : pFase3,
      puntajeTotal: isRejected ? null : (typeof fases.puntaje_total === 'number' ? fases.puntaje_total : null),
      motivoDescarte: fases.motivo_descarte || null,
      email: app.candidate?.email || '',
      esCuidador: ca.es_cuidador === true,
      isFinalSelected: enrolledSet.has(app.candidate?.id),
      nivelSeleccion: enrollmentMap.get(app.candidate?.id)?.ruta_asignada || null,
      nivelActivo: enrollmentMap.has(app.candidate?.id)
        ? enrollmentMap.get(app.candidate?.id)?.estado_activo !== false
        : false,
    };
  });
}
