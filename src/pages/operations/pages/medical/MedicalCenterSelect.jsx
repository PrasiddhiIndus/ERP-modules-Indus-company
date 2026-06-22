import React, { useState } from "react";
import { MapPin, Star } from "lucide-react";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import {
  Breadcrumbs,
  DemoBanner,
  Badge,
  Modal,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  useThemeClasses,
} from "../../components/OperationsUi";

export default function MedicalCenterSelect() {
  const { data, refresh, theme } = useOperations();
  const t = useThemeClasses(theme);
  const [selected, setSelected] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirm = () => {
    window.alert(`Medical center "${selected?.name}" selected (UI preview)`);
    setConfirmOpen(false);
    setSelected(null);
  };

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("medical-centers")} theme={theme} />
      <PageHeader title="Medical Center Selection" subtitle="Choose accredited centers for PME scheduling" onRefresh={refresh} theme={theme} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(data?.medicalCenters || []).map((center) => (
          <SectionCard
            key={center.id}
            title={center.name}
            className={t.card}
            right={
              <button
                type="button"
                onClick={() => { setSelected(center); setConfirmOpen(true); }}
                className="text-[11px] text-[#1F3A8A] font-medium hover:underline"
              >
                Select
              </button>
            }
          >
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-1 text-gray-600">
                <MapPin className="w-3.5 h-3.5" />
                {center.city} · {center.distance_km} km away
              </div>
              <div className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span className="font-medium">{center.rating}</span>
                <Badge tone="bg-blue-50 text-blue-800">{center.accreditation}</Badge>
              </div>
              <p className="text-gray-500">Contact: {center.contact}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {center.specialties.map((s) => (
                  <Badge key={s} tone="bg-gray-100 text-gray-700">{s}</Badge>
                ))}
              </div>
            </div>
          </SectionCard>
        ))}
      </div>

      <Modal
        open={confirmOpen}
        title="Confirm Medical Center"
        onClose={() => setConfirmOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setConfirmOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleConfirm}>Confirm Selection</PrimaryButton>
          </div>
        }
      >
        {selected && (
          <div className="text-sm space-y-2">
            <p>You are assigning <strong>{selected.name}</strong> for the next PME appointment.</p>
            <p className="text-gray-500 text-xs">{selected.city} · {selected.contact}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
