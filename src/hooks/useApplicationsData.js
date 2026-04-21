import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export function useApplicationsData() {
  const [applications, setApplications] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [project, setProject] = useState(null);
  const [cohort, setCohort] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socioData, setSocioData] = useState([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Get active project
      const { data: proj, error: projErr } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'active')
        .limit(1)
        .single();
      if (projErr) throw projErr;
      setProject(proj);

      // 2. Get active cohort
      const { data: coh, error: cohErr } = await supabase
        .from('cohorts')
        .select('*')
        .eq('program_id', proj.id)
        .limit(1)
        .single();
      if (cohErr) throw cohErr;
      setCohort(coh);

      // 3. Get all applications with candidate data
      let allApps = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: apps, error: appsErr } = await supabase
          .from('project_applications')
          .select(`
            id,
            status,
            current_step,
            selection_scores,
            custom_answers,
            updated_at,
            candidate:candidates(
              id, first_name, last_name, email, phone, age, gender,
              education_level, city, document_type, document_number,
              acquisition_channel, is_active, birth_date,
              formal_experience_months, informal_experience_months
            )
          `)
          .eq('cohort_id', coh.id)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (appsErr) throw appsErr;
        
        if (apps && apps.length > 0) {
          allApps = [...allApps, ...apps];
          if (apps.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }
      // 4. Get enrollments
      const { data: enrs, error: enrErr } = await supabase
        .from('program_enrollments')
        .select(`
          id,
          status,
          custom_form_data,
          enrolled_at,
          candidate:candidates(
            id, first_name, last_name, email, city, document_type, document_number, phone, gender, age, birth_date
          )
        `)
        .eq('cohort_id', coh.id);

      if (!enrErr && enrs) {
        setEnrollments(enrs);

        const activeEnrolled = enrs.filter(e => e.custom_form_data?.estado_activo === true);
        const activeCandidateIds = activeEnrolled.map(e => e.candidate?.id).filter(Boolean);

        if (activeCandidateIds.length > 0) {
          const { data: socio } = await supabase
            .from('socio_demographic_data')
            .select('candidate_id, gender_identity')
            .in('candidate_id', activeCandidateIds);
          setSocioData(socio || []);
        } else {
          setSocioData([]);
        }
      } else if (enrErr) {
        console.warn('Could not fetch enrollments:', enrErr);
      }
      
      setApplications(allApps);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Computed metrics
  const metrics = useMemo(() => {
    if (!applications.length) return null;

    const total = applications.length;

    // Extract seguimiento_fases from custom_answers
    const withFases = applications.map(app => {
      const ca = app.custom_answers || {};
      const fases = ca.seguimiento_fases || {};
      return {
        ...app,
        fases,
        grupoAsignado: fases.grupo_asignado || 'Sin asignar',
        puntajeTecnico: typeof fases.puntaje_tecnico === 'number' ? fases.puntaje_tecnico : null,
        puntajeEntrevista: typeof fases.puntaje_entrevista === 'number' ? fases.puntaje_entrevista : null,
        puntajeTotal: typeof fases.puntaje_total === 'number' ? fases.puntaje_total : null,
        elegibilidad: fases.elegibilidad || 'pending',
        seccionEntrevista: fases.seccion_entrevista || 'pending',
        motivoDescarte: ca.motivo_descarte || fases.motivo_descarte || 'N/A',
      };
    });

    // Elegibility
    const elegibles = withFases.filter(a => a.elegibilidad !== 'rejected');
    const noElegibles = withFases.filter(a => a.elegibilidad === 'rejected');

    // Grupo distribution
    const grupoDistribution = {};
    withFases.forEach(a => {
      const g = a.grupoAsignado;
      grupoDistribution[g] = (grupoDistribution[g] || 0) + 1;
    });

    // Those with puntaje_tecnico assigned (evaluated)
    const evaluados = withFases.filter(a => a.puntajeTecnico !== null && a.puntajeTecnico > 0);
    const avgPuntajeTecnico = evaluados.length
      ? (evaluados.reduce((sum, a) => sum + a.puntajeTecnico, 0) / evaluados.length).toFixed(1)
      : 0;

    // Those who went to interview
    const entrevistados = withFases.filter(a => a.puntajeEntrevista !== null && a.puntajeEntrevista > 0);

    // City distribution
    const cityDistribution = {};
    withFases.forEach(a => {
      const city = a.candidate?.city || 'Sin ciudad';
      cityDistribution[city] = (cityDistribution[city] || 0) + 1;
    });

    // Gender distribution
    const genderDistribution = {};
    withFases.forEach(a => {
      const g = a.candidate?.gender || 'Sin información';
      genderDistribution[g] = (genderDistribution[g] || 0) + 1;
    });

    // Gender distribution for elegibles only
    const genderDistributionElegibles = {};
    elegibles.forEach(a => {
      const g = a.candidate?.gender || 'Sin información';
      genderDistributionElegibles[g] = (genderDistributionElegibles[g] || 0) + 1;
    });

    // Education distribution
    const educationDistribution = {};
    withFases.forEach(a => {
      const ed = a.candidate?.education_level || 'Sin información';
      educationDistribution[ed] = (educationDistribution[ed] || 0) + 1;
    });

    // Age distribution (ranges)
    const ageRanges = { '40-45': 0, '46-50': 0, '51-55': 0, '56-60': 0, '61-65': 0, '66-70': 0, '71+': 0, 'Sin info': 0 };
    withFases.forEach(a => {
      const age = a.candidate?.age;
      if (!age || age === 0) {
        // Try to compute from birth_date
        if (a.candidate?.birth_date) {
          const birthDate = new Date(a.candidate.birth_date);
          const today = new Date();
          const computed = today.getFullYear() - birthDate.getFullYear();
          assignAgeRange(computed, ageRanges);
        } else {
          ageRanges['Sin info']++;
        }
      } else {
        assignAgeRange(age, ageRanges);
      }
    });

    // Funnel data
    const funnelData = [
      { name: 'Postulados', value: total, color: '#7c3aed' },
      { name: 'Elegibles', value: elegibles.length, color: '#0d9488' },
      { name: 'Evaluados', value: evaluados.length, color: '#3b82f6' },
      { name: 'Entrevistados', value: entrevistados.length, color: '#f97316' },
    ];

    // Status distribution
    const statusDistribution = {};
    withFases.forEach(a => {
      const s = a.status || 'unknown';
      statusDistribution[s] = (statusDistribution[s] || 0) + 1;
    });

    const reemplazos = withFases.filter(a => {
      const grupo = a.grupoAsignado || '';
      return grupo === 'Reemplazo' || grupo.toLowerCase().includes('respaldo');
    });

    // Tasa de avance (elegibles / total)
    const tasaElegibilidad = total > 0 ? ((elegibles.length / total) * 100).toFixed(1) : 0;

    // Motivos descarte distribution
    const motivosDescarteDistribution = {};
    noElegibles.forEach(a => {
      let m = a.motivoDescarte;
      if (!m || m === 'N/A') m = 'No especificado';
      motivosDescarteDistribution[m] = (motivosDescarteDistribution[m] || 0) + 1;
    });

    // Enrolled candidate IDs set (for cross-referencing)
    const enrolledCandidateIds = new Set(
      enrollments
        .filter(e => e.custom_form_data?.estado_activo === true)
        .map(e => e.candidate?.id)
        .filter(Boolean)
    );

    // Cuidadores metrics (from project_applications.custom_answers.es_cuidador)
    const isMaleG = (g) => { const s = (g || '').toLowerCase().trim(); return ['masculino', 'hombre', 'male'].some(v => s.includes(v)) || s === 'm'; };
    const isFemaleG = (g) => { const s = (g || '').toLowerCase().trim(); return ['femenino', 'mujer', 'female'].some(v => s.includes(v)) || s === 'f'; };

    const cuidadoresAll = withFases.filter(a => a.custom_answers?.es_cuidador === true);
    const cuidadoresHombres = cuidadoresAll.filter(a => isMaleG(a.candidate?.gender));
    const cuidadoresMujeres = cuidadoresAll.filter(a => isFemaleG(a.candidate?.gender));
    const cuidadoresElegidos = cuidadoresAll.filter(a => enrolledCandidateIds.has(a.candidate?.id));
    const cuidadoresNoElegidos = cuidadoresAll.filter(a => !enrolledCandidateIds.has(a.candidate?.id));

    const cuidadores = {
      total: cuidadoresAll.length,
      hombres: cuidadoresHombres.length,
      mujeres: cuidadoresMujeres.length,
      elegidos: cuidadoresElegidos.length,
      noElegidos: cuidadoresNoElegidos.length,
      hombresElegidos: cuidadoresHombres.filter(a => enrolledCandidateIds.has(a.candidate?.id)).length,
      mujeresElegidas: cuidadoresMujeres.filter(a => enrolledCandidateIds.has(a.candidate?.id)).length,
      hombresNoElegidos: cuidadoresHombres.filter(a => !enrolledCandidateIds.has(a.candidate?.id)).length,
      mujeresNoElegidas: cuidadoresMujeres.filter(a => !enrolledCandidateIds.has(a.candidate?.id)).length,
    };

    const enrolledCandidateIdsArray = [...enrolledCandidateIds];

    // Enrolled active candidates metrics
    const genderMap = {};
    socioData.forEach(s => {
      if (s.gender_identity) genderMap[s.candidate_id] = s.gender_identity;
    });

    const activeEnrollments = enrollments.filter(e => e.custom_form_data?.estado_activo === true);
    const totalEnrolledActive = activeEnrollments.length;

    const enrolledGenderDistribution = {};
    activeEnrollments.forEach(e => {
      const cid = e.candidate?.id;
      const gender = genderMap[cid] || e.candidate?.gender || 'Sin información';
      enrolledGenderDistribution[gender] = (enrolledGenderDistribution[gender] || 0) + 1;
    });

    const enrolledAgeDistribMen = { '45-50': 0, '50-55': 0, '55-60': 0, '60-65': 0, '65-70': 0, '70-75': 0 };
    const enrolledAgeDistribWomen = { '45-50': 0, '50-55': 0, '55-60': 0, '60-65': 0, '65-70': 0, '70-75': 0 };

    activeEnrollments.forEach(e => {
      const cid = e.candidate?.id;
      const genderRaw = (genderMap[cid] || e.candidate?.gender || '').toLowerCase().trim();
      const isMale = ['masculino', 'hombre', 'male'].some(v => genderRaw.includes(v)) || genderRaw === 'm';
      const isFemale = ['femenino', 'mujer', 'female'].some(v => genderRaw.includes(v)) || genderRaw === 'f';

      let age = e.candidate?.age || 0;
      if ((!age || age === 0) && e.candidate?.birth_date) {
        const birth = new Date(e.candidate.birth_date);
        const today = new Date();
        age = today.getFullYear() - birth.getFullYear();
        const mo = today.getMonth() - birth.getMonth();
        if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--;
      }

      const range = getEnrolledAgeRange(age);
      if (!range) return;
      if (isMale) enrolledAgeDistribMen[range]++;
      else if (isFemale) enrolledAgeDistribWomen[range]++;
    });

    return {
      total,
      elegibles: elegibles.length,
      noElegibles: noElegibles.length,
      evaluados: evaluados.length,
      entrevistados: entrevistados.length,
      reemplazos: reemplazos.length,
      avgPuntajeTecnico,
      tasaElegibilidad,
      grupoDistribution,
      cityDistribution,
      genderDistribution,
      genderDistributionElegibles,
      educationDistribution,
      ageRanges,
      funnelData,
      statusDistribution,
      motivosDescarteDistribution,
      withFases,
      enrolledGenderDistribution,
      enrolledAgeDistribMen,
      enrolledAgeDistribWomen,
      totalEnrolledActive,
      cuidadores,
      enrolledCandidateIdsArray,
    };
  }, [applications, enrollments, socioData]);

  // Update an application's custom_answers
  const updateApplication = async (applicationId, updatedCustomAnswers) => {
    const { error: updateErr } = await supabase
      .from('project_applications')
      .update({ custom_answers: updatedCustomAnswers })
      .eq('id', applicationId);

    if (updateErr) throw updateErr;
    await fetchData(); // Refresh
  };

  return { applications, enrollments, project, cohort, metrics, loading, error, updateApplication, refetch: fetchData };
}

function getEnrolledAgeRange(age) {
  if (!age || age < 45) return null;
  if (age < 50) return '45-50';
  if (age < 55) return '50-55';
  if (age < 60) return '55-60';
  if (age < 65) return '60-65';
  if (age < 70) return '65-70';
  if (age <= 75) return '70-75';
  return null;
}

function assignAgeRange(age, ranges) {
  if (age >= 40 && age <= 45) ranges['40-45']++;
  else if (age >= 46 && age <= 50) ranges['46-50']++;
  else if (age >= 51 && age <= 55) ranges['51-55']++;
  else if (age >= 56 && age <= 60) ranges['56-60']++;
  else if (age >= 61 && age <= 65) ranges['61-65']++;
  else if (age >= 66 && age <= 70) ranges['66-70']++;
  else if (age >= 71) ranges['71+']++;
  else ranges['Sin info']++;
}
