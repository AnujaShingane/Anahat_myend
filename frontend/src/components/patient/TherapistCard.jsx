function nameInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function TherapistCard({ therapist, onViewProfile, onBook, bookLabel = 'Book appointment', selected = false }) {
  const description = therapist.expertise?.join(', ') || therapist.bio || 'Music therapy and wellbeing support';

  return (
    <article
      className={`group flex h-[296px] flex-col overflow-hidden rounded-xl bg-white p-6 transition-all duration-200 ${
        selected
          ? 'ring-2 ring-[#0F8594] shadow-[0_10px_30px_-12px_rgba(32,175,192,0.35)]'
          : 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-18px_rgba(15,23,42,0.12)] hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.16)] hover:-translate-y-0.5'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[#E5F7F8]">
          {therapist.avatarUrl ? (
            <img src={therapist.avatarUrl} alt={therapist.name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-base font-bold text-[#0A6976]">{nameInitials(therapist.name)}</span>
          )}
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 className="truncate text-base font-bold text-slate-900">{therapist.name}</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">{therapist.profile?.profession || 'Therapist'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            {therapist.experienceYears != null && <span className="font-semibold text-slate-600">{therapist.experienceYears}+ yrs experience</span>}
            {therapist.location && <span className="truncate">{therapist.location}</span>}
          </div>
        </div>
      </div>

      <p className="therapist-card-description mt-4 h-[58px] text-[13px] leading-relaxed text-slate-500">{description}</p>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        {therapist.fee != null ? (
          <p className="text-sm font-semibold text-slate-800">₹{therapist.fee} <span className="text-xs font-normal text-slate-400">/ session</span></p>
        ) : <span />}
        <div className="flex gap-2">
          <button type="button" onClick={onViewProfile} className="rounded-full px-4 py-2 text-xs font-semibold text-[#0A6976] transition hover:bg-[#E5F7F8]">View profile</button>
          <button type="button" onClick={onBook} className="rounded-full bg-[#0F8594] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#0F8594]">{bookLabel}</button>
        </div>
      </div>
    </article>
  );
}
