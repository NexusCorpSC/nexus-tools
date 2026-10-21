import "server-only";
import {
  listTimelineEvents,
  resolveTimelineRefs,
} from "@/lib/timeline-events";
import type { TimelineEventInput } from "@/types/timeline-events";
import type { EventFormOption } from "./event-form";

/**
 * Ce que le formulaire d'évènement montre d'emblée : les fiches des
 * récompenses et des contrats déjà choisis, le lieu, et les autres évènements
 * qu'on peut lier.
 */
export async function eventFormProps(
  initial: Partial<TimelineEventInput> | undefined,
) {
  const [refs, events] = await Promise.all([
    resolveTimelineRefs({
      tracks: initial?.tracks ?? [],
      missions: initial?.missions ?? [],
      placeSlug: initial?.placeSlug,
      relatedSlugs: [],
    }),
    listTimelineEvents(),
  ]);
  const eventOptions: EventFormOption[] = events
    .filter((event) => event.slug !== initial?.slug)
    .map((event) => ({ slug: event.slug, name: event.name }));
  return {
    initialItems: refs.items,
    initialMissionTitles: refs.missions,
    initialPlace: refs.place,
    eventOptions,
  };
}
