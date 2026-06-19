import { acceptHMRUpdate, defineStore } from "pinia";
import api from "../utils/api";

export interface Property {
  id: string;
  bookId: string;
  name: string;
  type: "section-type";
  options: string[];
}

export interface SectionPropertyValue {
  sectionId: string;
  propertyId: string;
  value: string;
}

export const usePropertiesStore = defineStore("properties", {
  state: () => ({
    properties: [] as Property[],
    sectionValues: {} as Record<string, SectionPropertyValue[]>,
  }),

  getters: {
    /**
     * Returns the first section-type property for a book
     * (there should typically be only one)
     */
    sectionTypeProperty: (state) => {
      return state.properties.find((p) => p.type === "section-type") || null;
    },
  },

  actions: {
    async fetchByBook(bookId: string) {
      const res = await api.get("/properties", { params: { bookId } });
      this.properties = res.data;
    },

    async create(bookId: string, name: string, options?: string[]) {
      const res = await api.post("/properties", { bookId, name, options });
      this.properties.push(res.data);
      return res.data;
    },

    async update(id: string, data: { name?: string; options?: string[] }) {
      const res = await api.put(`/properties/${id}`, data);
      const index = this.properties.findIndex((p) => p.id === id);
      if (index >= 0) this.properties[index] = res.data;
      return res.data;
    },

    async remove(id: string) {
      await api.delete(`/properties/${id}`);
      this.properties = this.properties.filter((p) => p.id !== id);
    },

    async fetchSectionValues(sectionId: string) {
      const res = await api.get(`/properties/section/${sectionId}`);
      this.sectionValues[sectionId] = res.data;
      return res.data;
    },

    async setSectionValue(
      sectionId: string,
      propertyId: string,
      value: string,
    ) {
      await api.put(`/properties/section/${sectionId}`, {
        propertyId,
        value,
      });
      if (!this.sectionValues[sectionId]) this.sectionValues[sectionId] = [];
      const existing = this.sectionValues[sectionId].find(
        (v) => v.propertyId === propertyId,
      );
      if (existing) {
        existing.value = value;
      } else {
        this.sectionValues[sectionId].push({
          sectionId,
          propertyId,
          value,
        });
      }
    },

    async removeSectionValue(sectionId: string, propertyId: string) {
      await api.delete(`/properties/section/${sectionId}/${propertyId}`);
      if (this.sectionValues[sectionId]) {
        this.sectionValues[sectionId] = this.sectionValues[sectionId].filter(
          (v) => v.propertyId !== propertyId,
        );
      }
    },

    /**
     * Get the section types assigned to a section (parsed from comma-separated value)
     */
    getSectionTypes(sectionId: string): string[] {
      const prop = this.sectionTypeProperty;
      if (!prop) return [];
      const vals = this.sectionValues[sectionId] || [];
      const found = vals.find((v) => v.propertyId === prop.id);
      if (!found || !found.value) return [];
      return found.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    },

    /**
     * Toggle a section type on/off for a section
     */
    async toggleSectionType(
      sectionId: string,
      propertyId: string,
      typeName: string,
    ) {
      const current = this.getSectionTypes(sectionId);
      let next: string[];
      if (current.includes(typeName)) {
        next = current.filter((t) => t !== typeName);
      } else {
        next = [...current, typeName];
      }
      const value = next.join(",");
      await this.setSectionValue(sectionId, propertyId, value);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePropertiesStore, import.meta.hot));
}
