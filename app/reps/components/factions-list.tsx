"use client";

import { Radio, RadioGroup } from "@headlessui/react";
import { cn } from "@/lib/utils";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  setPlayerReputation,
  setPlayerReputationStandingAction,
} from "@/app/reps/actions";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Faction, PlayerReputations } from "@/types/reputations";

export function FactionsList({
  factions,
  playerReputation,
}: {
  factions: Faction[];
  playerReputation: PlayerReputations;
}) {
  const [openQuery, setOpenQuery] = useState(false);
  const [selectedFactionName, setSelectedFactionName] = useState("");

  const selectedFaction = factions.find((f) => f.name === selectedFactionName);

  return (
    <div>
      <div className="flex flex-row space-x-4 py-4">
        <Popover open={openQuery} onOpenChange={setOpenQuery}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openQuery}
              className="w-full justify-between"
            >
              {selectedFactionName
                ? factions.find(
                    (faction) => faction.name === selectedFactionName,
                  )?.name
                : "Choisissez une faction..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder="Chercher une faction..." />
              <CommandList>
                <CommandEmpty>No faction found.</CommandEmpty>
                <CommandGroup>
                  {factions.map((faction) => (
                    <CommandItem
                      key={faction.name}
                      value={faction.name}
                      onSelect={(currentValue: string) => {
                        setSelectedFactionName(
                          currentValue === selectedFactionName
                            ? ""
                            : currentValue,
                        );
                        setOpenQuery(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedFactionName === faction.name
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {faction.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button onClick={() => setSelectedFactionName("")}>Clear</Button>
      </div>

      {selectedFaction ? (
        <div>
          <Card className="p-4">
            <CardTitle>{selectedFaction.name}</CardTitle>
            <CardContent>
              <div>
                {selectedFaction.standings && (
                  <div className="space-y-2">
                    <h3>Réputation</h3>

                    <RadioGroup
                      className="mt-6 grid grid-cols-1 gap-y-6 sm:grid-cols-3 sm:gap-x-4"
                      onChange={async (standing) => {
                        await setPlayerReputationStandingAction(
                          selectedFaction.name,
                          standing,
                        );
                      }}
                      value={
                        playerReputation?.[selectedFaction.name]?.standing ?? ""
                      }
                    >
                      {selectedFaction.standings.map((standing) => (
                        <Radio
                          key={standing}
                          value={standing}
                          aria-label={standing}
                          className={cn(
                            "group relative flex cursor-pointer rounded-lg border border-gray-300 bg-white p-4 shadow-sm focus:outline-none data-[focus]:border-emerald-600 data-[focus]:ring-2 data-[focus]:ring-emerald-600",
                            standing == selectedFaction.defaultStanding &&
                              "border-indigo-600",
                          )}
                        >
                          <span className="flex flex-1">
                            <span className="flex flex-col">
                              <span
                                className={cn(
                                  "block text-sm font-medium text-gray-900",
                                  standing === "Hostile" &&
                                    "group-data-[checked]:text-red-600",
                                  standing === "Ally" &&
                                    "group-data-[checked]:text-emerald-600",
                                )}
                              >
                                {standing}
                              </span>
                            </span>
                          </span>
                          <CheckCircleIcon
                            aria-hidden="true"
                            className={cn(
                              "size-5 group-[&:not([data-checked])]:invisible",
                              standing === "Hostile" && "text-red-600",
                              standing === "Ally" && "text-emerald-600",
                            )}
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "pointer-events-none absolute -inset-px rounded-lg border-2 border-transparent group-data-[focus]:border ",
                              standing === "Hostile" &&
                                "group-data-[checked]:border-red-600",
                              standing === "Ally" &&
                                "group-data-[checked]:border-emerald-600",
                            )}
                          />
                        </Radio>
                      ))}
                    </RadioGroup>
                  </div>
                )}

                {selectedFaction.careers &&
                  selectedFaction.careers.map((career) => (
                    <div key={career.name}>
                      <h3>{career.name}</h3>
                      <RadioGroup
                        className="mt-6 grid grid-cols-1 gap-y-6 sm:grid-cols-3 sm:gap-x-4"
                        onChange={async (levelname) => {
                          await setPlayerReputation(
                            selectedFaction.name,
                            career.name,
                            levelname,
                          );
                        }}
                        value={
                          playerReputation?.[selectedFaction.name]?.careers?.[
                            career.name
                          ]?.level.name ?? ""
                        }
                      >
                        {career.levels.map((level) => (
                          <Radio
                            key={level.name}
                            value={level.name}
                            aria-label={level.name}
                            className={cn(
                              "group relative flex cursor-pointer rounded-lg border border-gray-300 bg-white p-4 shadow-sm focus:outline-none data-[focus]:border-emerald-600 data-[focus]:ring-2 data-[focus]:ring-emerald-600",
                              level.isDefault && "border-indigo-600",
                            )}
                          >
                            <span className="flex flex-1">
                              <span className="flex flex-col">
                                <span
                                  className={cn(
                                    "block text-sm font-medium text-gray-900",
                                    level.level === -1
                                      ? "group-data-[checked]:text-red-600"
                                      : "group-data-[checked]:text-emerald-600",
                                  )}
                                >
                                  {level.name}
                                </span>
                              </span>
                            </span>
                            <CheckCircleIcon
                              aria-hidden="true"
                              className={cn(
                                "size-5 group-[&:not([data-checked])]:invisible",
                                level.level === -1
                                  ? "text-red-600"
                                  : "text-emerald-600",
                              )}
                            />
                            <span
                              aria-hidden="true"
                              className={cn(
                                "pointer-events-none absolute -inset-px rounded-lg border-2 border-transparent group-data-[focus]:border ",
                                level.level === -1
                                  ? "group-data-[checked]:border-red-600"
                                  : "group-data-[checked]:border-emerald-600",
                              )}
                            />
                          </Radio>
                        ))}
                      </RadioGroup>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          {factions.map((faction) => (
            <div key={faction.name}>
              <Card className="p-4">
                <CardTitle>{faction.name}</CardTitle>
                <CardContent>
                  <div>
                    {faction.standings && (
                      <div className="space-y-2">
                        <h3>Réputation</h3>

                        <RadioGroup
                          className="mt-6 grid grid-cols-1 gap-y-6 sm:grid-cols-3 sm:gap-x-4"
                          onChange={async (standing) => {
                            await setPlayerReputationStandingAction(
                              faction.name,
                              standing,
                            );
                          }}
                          value={
                            playerReputation?.[faction.name]?.standing ?? ""
                          }
                        >
                          {faction.standings.map((standing) => (
                            <Radio
                              key={standing}
                              value={standing}
                              aria-label={standing}
                              className={cn(
                                "group relative flex cursor-pointer rounded-lg border border-gray-300 bg-white p-4 shadow-sm focus:outline-none data-[focus]:border-emerald-600 data-[focus]:ring-2 data-[focus]:ring-emerald-600",
                                standing == faction.defaultStanding &&
                                  "border-indigo-600",
                              )}
                            >
                              <span className="flex flex-1">
                                <span className="flex flex-col">
                                  <span
                                    className={cn(
                                      "block text-sm font-medium text-gray-900",
                                      standing === "Hostile" &&
                                        "group-data-[checked]:text-red-600",
                                      standing === "Ally" &&
                                        "group-data-[checked]:text-emerald-600",
                                    )}
                                  >
                                    {standing}
                                  </span>
                                </span>
                              </span>
                              <CheckCircleIcon
                                aria-hidden="true"
                                className={cn(
                                  "size-5 group-[&:not([data-checked])]:invisible",
                                  standing === "Hostile" && "text-red-600",
                                  standing === "Ally" && "text-emerald-600",
                                )}
                              />
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "pointer-events-none absolute -inset-px rounded-lg border-2 border-transparent group-data-[focus]:border ",
                                  standing === "Hostile" &&
                                    "group-data-[checked]:border-red-600",
                                  standing === "Ally" &&
                                    "group-data-[checked]:border-emerald-600",
                                )}
                              />
                            </Radio>
                          ))}
                        </RadioGroup>
                      </div>
                    )}

                    <div className="space-y-2">
                      {faction.careers &&
                        faction.careers.map((career) => (
                          <div key={career.name}>
                            <h3>{career.name}</h3>
                            <RadioGroup
                              className="mt-6 grid grid-cols-1 gap-y-6 sm:grid-cols-3 sm:gap-x-4"
                              onChange={async (levelname) => {
                                await setPlayerReputation(
                                  faction.name,
                                  career.name,
                                  levelname,
                                );
                              }}
                              value={
                                playerReputation?.[faction.name]?.careers?.[
                                  career.name
                                ]?.level.name ?? ""
                              }
                            >
                              {career.levels.map((level) => (
                                <Radio
                                  key={level.name}
                                  value={level.name}
                                  aria-label={level.name}
                                  className={cn(
                                    "group relative flex cursor-pointer rounded-lg border border-gray-300 bg-white p-4 shadow-sm focus:outline-none data-[focus]:border-emerald-600 data-[focus]:ring-2 data-[focus]:ring-emerald-600",
                                    level.isDefault && "border-indigo-600",
                                  )}
                                >
                                  <span className="flex flex-1">
                                    <span className="flex flex-col">
                                      <span
                                        className={cn(
                                          "block text-sm font-medium text-gray-900",
                                          level.level === -1
                                            ? "group-data-[checked]:text-red-600"
                                            : "group-data-[checked]:text-emerald-600",
                                        )}
                                      >
                                        {level.name}
                                      </span>
                                    </span>
                                  </span>
                                  <CheckCircleIcon
                                    aria-hidden="true"
                                    className={cn(
                                      "size-5 group-[&:not([data-checked])]:invisible",
                                      level.level === -1
                                        ? "text-red-600"
                                        : "text-emerald-600",
                                    )}
                                  />
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      "pointer-events-none absolute -inset-px rounded-lg border-2 border-transparent group-data-[focus]:border ",
                                      level.level === -1
                                        ? "group-data-[checked]:border-red-600"
                                        : "group-data-[checked]:border-emerald-600",
                                    )}
                                  />
                                </Radio>
                              ))}
                            </RadioGroup>
                          </div>
                        ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
