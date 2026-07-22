import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Círculos de Conocimiento vive en su propia cohorte, fijada por slug (nunca por
// status='active': la base aloja dos programas activos).
const CIRCULOS_COHORT_SLUG = 'circulos-de-conocimiento-i-2026';

// La caracterización se lee de project_applications.custom_answers.caracterizacion,
// que es donde el ETL dejó todo lo que el formulario de HubSpot no tenía columna
// propia en el modelo (estrato, comuna, barrio, habilidades, power skills…).
export function useCirculosData() {
  const [cohorte, setCohorte] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: coh, error: cohErr } = await supabase
        .from('cohorts')
        .select('id, name, start_date')
        .eq('slug_application', CIRCULOS_COHORT_SLUG)
        .limit(1)
        .single();
      if (cohErr) throw cohErr;
      setCohorte(coh);

      // Matrículas (quiénes son) + postulación (su caracterización) + candidato.
      const { data: enrs, error: enrErr } = await supabase
        .from('program_enrollments')
        .select(`
          id, status, custom_form_data,
          candidate:candidates(id, first_name, last_name, email, phone, age, gender, birth_date, city, education_level)
        `)
        .eq('cohort_id', coh.id);
      if (enrErr) throw enrErr;

      const { data: apps, error: appErr } = await supabase
        .from('project_applications')
        .select('candidate_id, custom_answers')
        .eq('cohort_id', coh.id);
      if (appErr) throw appErr;

      const caracPorCand = new Map(
        (apps || []).map((a) => [a.candidate_id, a.custom_answers?.caracterizacion || {}])
      );

      // socio_demographic_data guarda la identidad de género (1:1 con candidates).
      const ids = (enrs || []).map((e) => e.candidate?.id).filter(Boolean);
      let socioPorCand = new Map();
      if (ids.length) {
        const { data: socio } = await supabase
          .from('socio_demographic_data')
          .select('candidate_id, gender_identity, sexual_orientation, ethnicity, marital_status')
          .in('candidate_id', ids);
        socioPorCand = new Map((socio || []).map((s) => [s.candidate_id, s]));
      }

      setParticipantes(
        (enrs || []).map((e) => {
          const c = e.candidate || {};
          const carac = caracPorCand.get(c.id) || {};
          return {
            id: e.id,
            candidateId: c.id,
            nombre: e.custom_form_data?.nombre_completo || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            email: c.email || '',
            edad: c.age || null,
            // Sexo y escolaridad se toman del formulario de Círculos, no de los
            // campos compartidos: para los 249 que venían de Horizontes Senior esos
            // campos conservan el valor heredado, que difiere en 43 casos
            // (education_level, cuyo vocabulario en HS no tenía "Maestría") y en 2
            // casos de sexo. Para caracterizar Círculos manda lo que se respondió aquí.
            genero: carac.sexo || socioPorCand.get(c.id)?.gender_identity || c.gender || 'Sin información',
            orientacion: carac.identidad_genero || socioPorCand.get(c.id)?.sexual_orientation || null,
            escolaridad: carac.escolaridad || c.education_level || 'Sin información',
            ciudad: carac.municipio || c.city || 'Sin información',
            activo: e.custom_form_data?.estado_activo !== false && e.status !== 'inactive',
            carac,
          };
        })
      );
    } catch (err) {
      console.error('Error cargando Círculos:', err);
      setError(err.message || 'Error al cargar los datos de Círculos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const metricas = useMemo(() => {
    if (!participantes.length) return null;
    const total = participantes.length;

    const cuenta = (fn) => {
      const m = {};
      participantes.forEach((p) => {
        const k = fn(p) || 'Sin información';
        m[k] = (m[k] || 0) + 1;
      });
      return m;
    };

    // 1. Sexo / identidad de género
    const genero = cuenta((p) => p.genero);
    const mujeres = genero['Femenino'] || 0;
    const hombres = genero['Masculino'] || 0;

    // 2. Edad cruzada con identidad de género
    const RANGOS = ['45-49', '50-54', '55-59', '60-64', '65-69', '70+', 'Fuera de rango'];
    const rangoDe = (edad) => {
      if (!edad) return null;
      if (edad < 45) return 'Fuera de rango';
      if (edad < 50) return '45-49';
      if (edad < 55) return '50-54';
      if (edad < 60) return '55-59';
      if (edad < 65) return '60-64';
      if (edad < 70) return '65-69';
      return '70+';
    };
    const edadPorGenero = RANGOS.map((rango) => {
      const enRango = participantes.filter((p) => rangoDe(p.edad) === rango);
      return {
        rango,
        Mujeres: enRango.filter((p) => p.genero === 'Femenino').length,
        Hombres: enRango.filter((p) => p.genero === 'Masculino').length,
        total: enRango.length,
      };
    }).filter((r) => r.total > 0);

    const edades = participantes.map((p) => p.edad).filter(Boolean).sort((a, b) => a - b);
    const edadPromedio = edades.length ? Math.round(edades.reduce((s, e) => s + e, 0) / edades.length) : null;
    const edadMediana = edades.length ? edades[Math.floor(edades.length / 2)] : null;

    // 3. Nivel profesional
    const ORDEN_NIVEL = ['Doctorado', 'Maestría', 'Especialización', 'Profesional', 'Tecnológico', 'Técnico', 'Media Bachiller', 'Ninguno', 'Sin información'];
    const nivelBruto = cuenta((p) => p.escolaridad);
    const nivelProfesional = ORDEN_NIVEL
      .filter((n) => nivelBruto[n])
      .map((n) => ({ nombre: n, valor: nivelBruto[n] }));
    const posgrado = (nivelBruto['Doctorado'] || 0) + (nivelBruto['Maestría'] || 0) + (nivelBruto['Especialización'] || 0);

    // 4. Cuidadores — el formulario de Círculos NO preguntó por esto. Lo más
    //    cercano que sí capturó es la jefatura de hogar, que es otra cosa y se
    //    reporta como tal, sin hacerla pasar por el dato de cuidadores.
    const cabezaHogar = cuenta((p) => p.carac.cabeza_de_hogar);

    // 5. Zonas: municipio para todos; comuna solo aplica a quienes viven en Medellín.
    const municipios = Object.entries(cuenta((p) => p.carac.municipio || p.ciudad))
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor);

    const enMedellin = participantes.filter((p) => (p.carac.municipio || p.ciudad) === 'Medellín');
    const comunasMap = {};
    enMedellin.forEach((p) => {
      const c = p.carac.comuna || 'Sin especificar';
      comunasMap[c] = (comunasMap[c] || 0) + 1;
    });
    const comunas = Object.entries(comunasMap)
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor);

    const barriosMap = {};
    participantes.forEach((p) => {
      if (p.carac.barrio) barriosMap[p.carac.barrio] = (barriosMap[p.carac.barrio] || 0) + 1;
    });
    const barrios = Object.entries(barriosMap)
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor);

    // Origen: quién venía de Horizontes Senior. El ETL no lo marcó (es derivable),
    // así que aquí se infiere de si la caracterización trae rastro de HubSpot.
    const estrato = Object.entries(cuenta((p) => (p.carac.estrato ? `Estrato ${p.carac.estrato}` : null)))
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return {
      total,
      activos: participantes.filter((p) => p.activo).length,
      genero, mujeres, hombres,
      pctMujeres: total ? Math.round((mujeres / total) * 100) : 0,
      pctHombres: total ? Math.round((hombres / total) * 100) : 0,
      edadPorGenero, edadPromedio, edadMediana,
      nivelProfesional, posgrado,
      cabezaHogar,
      municipios, comunas, barrios, estrato,
    };
  }, [participantes]);

  return { cohorte, participantes, metricas, loading, error, refetch: fetchData };
}
