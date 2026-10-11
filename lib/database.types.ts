export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      actions: {
        Row: {
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          row_id: string | null
          table_name: string
          tool: string
          undone_at: string | null
        }
        Insert: {
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          row_id?: string | null
          table_name: string
          tool: string
          undone_at?: string | null
        }
        Update: {
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          row_id?: string | null
          table_name?: string
          tool?: string
          undone_at?: string | null
        }
        Relationships: []
      }
      applications: {
        Row: {
          applied_date: string
          company: string
          created_at: string
          deleted_at: string | null
          id: string
          position: string
          resume_name: string | null
          status: string
        }
        Insert: {
          applied_date: string
          company: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          position: string
          resume_name?: string | null
          status: string
        }
        Update: {
          applied_date?: string
          company?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          position?: string
          resume_name?: string | null
          status?: string
        }
        Relationships: []
      }
      breaks: {
        Row: {
          created_at: string
          deleted_at: string | null
          end_date: string | null
          id: string
          label: string
          start_date: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          label: string
          start_date: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          label?: string
          start_date?: string
        }
        Relationships: []
      }
      callbacks: {
        Row: {
          application_id: string | null
          company: string
          created_at: string
          debrief: string | null
          deleted_at: string | null
          id: string
          kind: string
          logical_date: string | null
          outcome: string | null
          score: string | null
        }
        Insert: {
          application_id?: string | null
          company: string
          created_at?: string
          debrief?: string | null
          deleted_at?: string | null
          id?: string
          kind: string
          logical_date?: string | null
          outcome?: string | null
          score?: string | null
        }
        Update: {
          application_id?: string | null
          company?: string
          created_at?: string
          debrief?: string | null
          deleted_at?: string | null
          id?: string
          kind?: string
          logical_date?: string | null
          outcome?: string | null
          score?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "callbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          aliases: string[]
          created_at: string
          deleted_at: string | null
          id: string
          name: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      food_log: {
        Row: {
          amount: number | null
          calories: number
          carbs_g: number | null
          created_at: string
          deleted_at: string | null
          description: string
          fat_g: number | null
          food_id: string | null
          id: string
          logical_date: string
          protein_g: number
          saved_meal_name: string | null
          source: string
          unit: string | null
        }
        Insert: {
          amount?: number | null
          calories: number
          carbs_g?: number | null
          created_at?: string
          deleted_at?: string | null
          description: string
          fat_g?: number | null
          food_id?: string | null
          id?: string
          logical_date: string
          protein_g: number
          saved_meal_name?: string | null
          source: string
          unit?: string | null
        }
        Update: {
          amount?: number | null
          calories?: number
          carbs_g?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          fat_g?: number | null
          food_id?: string | null
          id?: string
          logical_date?: string
          protein_g?: number
          saved_meal_name?: string | null
          source?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_log_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          aliases: string[]
          calories: number
          carbs_g: number | null
          created_at: string
          deleted_at: string | null
          fat_g: number | null
          id: string
          name: string
          protein_g: number
          serving_amount: number
          serving_unit: string
          source: string
        }
        Insert: {
          aliases?: string[]
          calories: number
          carbs_g?: number | null
          created_at?: string
          deleted_at?: string | null
          fat_g?: number | null
          id?: string
          name: string
          protein_g: number
          serving_amount: number
          serving_unit: string
          source?: string
        }
        Update: {
          aliases?: string[]
          calories?: number
          carbs_g?: number | null
          created_at?: string
          deleted_at?: string | null
          fat_g?: number | null
          id?: string
          name?: string
          protein_g?: number
          serving_amount?: number
          serving_unit?: string
          source?: string
        }
        Relationships: []
      }
      lc_catalog: {
        Row: {
          aliases: string[]
          created_at: string
          difficulty: string
          id: string
          title: string
          topic: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          difficulty: string
          id?: string
          title: string
          topic: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          difficulty?: string
          id?: string
          title?: string
          topic?: string
        }
        Relationships: []
      }
      leetcode_log: {
        Row: {
          catalog_id: string | null
          created_at: string
          deleted_at: string | null
          difficulty: string | null
          hints: string | null
          id: string
          inferred: boolean
          logical_date: string
          minutes: number | null
          notes: string | null
          redo: boolean
          result: string | null
          title: string
          topic: string | null
        }
        Insert: {
          catalog_id?: string | null
          created_at?: string
          deleted_at?: string | null
          difficulty?: string | null
          hints?: string | null
          id?: string
          inferred?: boolean
          logical_date: string
          minutes?: number | null
          notes?: string | null
          redo?: boolean
          result?: string | null
          title: string
          topic?: string | null
        }
        Update: {
          catalog_id?: string | null
          created_at?: string
          deleted_at?: string | null
          difficulty?: string | null
          hints?: string | null
          id?: string
          inferred?: boolean
          logical_date?: string
          minutes?: number | null
          notes?: string | null
          redo?: boolean
          result?: string | null
          title?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leetcode_log_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "lc_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          kind: string
          logical_date: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind: string
          logical_date: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: string
          logical_date?: string
        }
        Relationships: []
      }
      phases: {
        Row: {
          calorie_target: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string | null
          protein_target_g: number | null
          start_date: string
        }
        Insert: {
          calorie_target?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string | null
          protein_target_g?: number | null
          start_date: string
        }
        Update: {
          calorie_target?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string | null
          protein_target_g?: number | null
          start_date?: string
        }
        Relationships: []
      }
      plan_exercises: {
        Row: {
          created_at: string
          deleted_at: string | null
          exercise_id: string
          id: string
          plan_id: string
          position: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          exercise_id: string
          id?: string
          plan_id: string
          position: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          exercise_id?: string
          id?: string
          plan_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_exercises_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      saved_meal_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          food_id: string
          id: string
          saved_meal_id: string
          servings: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          food_id: string
          id?: string
          saved_meal_id: string
          servings?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          food_id?: string
          id?: string
          saved_meal_id?: string
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "saved_meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_meal_items_saved_meal_id_fkey"
            columns: ["saved_meal_id"]
            isOneToOne: false
            referencedRelation: "saved_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_meals: {
        Row: {
          aliases: string[]
          calories: number
          carbs_g: number | null
          created_at: string
          deleted_at: string | null
          fat_g: number | null
          id: string
          name: string
          portion_unit: string
          protein_g: number
        }
        Insert: {
          aliases?: string[]
          calories: number
          carbs_g?: number | null
          created_at?: string
          deleted_at?: string | null
          fat_g?: number | null
          id?: string
          name: string
          portion_unit?: string
          protein_g: number
        }
        Update: {
          aliases?: string[]
          calories?: number
          carbs_g?: number | null
          created_at?: string
          deleted_at?: string | null
          fat_g?: number | null
          id?: string
          name?: string
          portion_unit?: string
          protein_g?: number
        }
        Relationships: []
      }
      sets: {
        Row: {
          created_at: string
          deleted_at: string | null
          exercise_id: string
          id: string
          reps: number
          set_number: number
          variant: string | null
          weight_lb: number | null
          workout_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          exercise_id: string
          id?: string
          reps: number
          set_number: number
          variant?: string | null
          weight_lb?: number | null
          workout_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          exercise_id?: string
          id?: string
          reps?: number
          set_number?: number
          variant?: string | null
          weight_lb?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sets_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          calorie_target: number
          confidence_threshold: number
          context_blurb: string | null
          id: number
          protein_target_g: number
          rest_seconds: number
          timezone: string
        }
        Insert: {
          calorie_target?: number
          confidence_threshold?: number
          context_blurb?: string | null
          id?: number
          protein_target_g?: number
          rest_seconds?: number
          timezone?: string
        }
        Update: {
          calorie_target?: number
          confidence_threshold?: number
          context_blurb?: string | null
          id?: number
          protein_target_g?: number
          rest_seconds?: number
          timezone?: string
        }
        Relationships: []
      }
      weights: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          logical_date: string
          note: string | null
          weight_lb: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          logical_date: string
          note?: string | null
          weight_lb: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          logical_date?: string
          note?: string | null
          weight_lb?: number
        }
        Relationships: []
      }
      workouts: {
        Row: {
          created_at: string
          deleted_at: string | null
          ended_at: string | null
          id: string
          logical_date: string
          plan_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          ended_at?: string | null
          id?: string
          logical_date: string
          plan_id?: string | null
          started_at: string
          status?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          ended_at?: string | null
          id?: string
          logical_date?: string
          plan_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      daily_totals: {
        Row: {
          calorie_target: number | null
          calories: number | null
          carbs_g: number | null
          entries: number | null
          fat_g: number | null
          logical_date: string | null
          protein_g: number | null
          protein_target_g: number | null
        }
        Relationships: []
      }
      weekly_weights: {
        Row: {
          avg_lb: number | null
          n: number | null
          week_start: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      delete_break: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_food_entry: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_meal: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_weight: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      is_owner: { Args: never; Returns: boolean }
      log_food: {
        Args: {
          p_calories: number
          p_carbs_g?: number
          p_date: string
          p_description: string
          p_fat_g?: number
          p_protein_g: number
          p_source?: string
          p_tool?: string
        }
        Returns: Json
      }
      log_saved_meal: {
        Args: {
          p_date: string
          p_meal_id: string
          p_portions?: number
          p_tool?: string
        }
        Returns: Json
      }
      save_break: {
        Args: {
          p_end: string
          p_label: string
          p_start: string
          p_tool?: string
        }
        Returns: Json
      }
      save_meal: {
        Args: {
          p_aliases: string[]
          p_calories: number
          p_carbs_g?: number
          p_fat_g?: number
          p_name: string
          p_portion_unit: string
          p_protein_g: number
          p_tool?: string
        }
        Returns: Json
      }
      save_weight: {
        Args: {
          p_date: string
          p_note?: string
          p_tool?: string
          p_weight_lb: number
        }
        Returns: Json
      }
      set_food_portions: {
        Args: {
          p_date: string
          p_id: string
          p_portions: number
          p_tool?: string
        }
        Returns: Json
      }
      targets_for: {
        Args: { p_date: string }
        Returns: {
          calorie_target: number
          protein_target_g: number
        }[]
      }
      update_break: {
        Args: {
          p_end: string
          p_id: string
          p_label: string
          p_start: string
          p_tool?: string
        }
        Returns: Json
      }
      update_food_entry: {
        Args: {
          p_calories: number
          p_carbs_g: number
          p_date: string
          p_description: string
          p_fat_g: number
          p_id: string
          p_protein_g: number
          p_tool?: string
        }
        Returns: Json
      }
      update_meal: {
        Args: {
          p_aliases: string[]
          p_calories: number
          p_carbs_g: number
          p_fat_g: number
          p_id: string
          p_name: string
          p_portion_unit: string
          p_protein_g: number
          p_tool?: string
        }
        Returns: Json
      }
      update_weight: {
        Args: {
          p_date: string
          p_id: string
          p_note: string
          p_tool?: string
          p_weight_lb: number
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
