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
          reverts: string | null
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
          reverts?: string | null
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
          reverts?: string | null
          row_id?: string | null
          table_name?: string
          tool?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actions_reverts_fkey"
            columns: ["reverts"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
        ]
      }
      application_reminders: {
        Row: {
          application_id: string | null
          company: string
          created_at: string
          deleted_at: string | null
          id: string
          noted_date: string
          position: string
        }
        Insert: {
          application_id?: string | null
          company: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          noted_date: string
          position: string
        }
        Update: {
          application_id?: string | null
          company?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          noted_date?: string
          position?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_reminders_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
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
      message_log: {
        Row: {
          client_msg_id: string
          corrected: boolean
          created_at: string
          id: string
          model: string | null
          response: Json | null
          route: string | null
          text: string
          tool_calls: Json | null
        }
        Insert: {
          client_msg_id: string
          corrected?: boolean
          created_at?: string
          id?: string
          model?: string | null
          response?: Json | null
          route?: string | null
          text: string
          tool_calls?: Json | null
        }
        Update: {
          client_msg_id?: string
          corrected?: boolean
          created_at?: string
          id?: string
          model?: string | null
          response?: Json | null
          route?: string | null
          text?: string
          tool_calls?: Json | null
        }
        Relationships: []
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
      pending_proposals: {
        Row: {
          args: Json
          created_at: string
          expires_at: string
          id: string
          message_id: string | null
          tool: string
          used_at: string | null
        }
        Insert: {
          args: Json
          created_at?: string
          expires_at?: string
          id?: string
          message_id?: string | null
          tool: string
          used_at?: string | null
        }
        Update: {
          args?: Json
          created_at?: string
          expires_at?: string
          id?: string
          message_id?: string | null
          tool?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_proposals_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "message_log"
            referencedColumns: ["id"]
          },
        ]
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
      runs: {
        Row: {
          calories_est: number | null
          created_at: string
          deleted_at: string | null
          distance_mi: number
          duration_sec: number
          id: string
          logical_date: string
          note: string | null
          weight_lb_used: number | null
        }
        Insert: {
          calories_est?: number | null
          created_at?: string
          deleted_at?: string | null
          distance_mi: number
          duration_sec: number
          id?: string
          logical_date: string
          note?: string | null
          weight_lb_used?: number | null
        }
        Update: {
          calories_est?: number | null
          created_at?: string
          deleted_at?: string | null
          distance_mi?: number
          duration_sec?: number
          id?: string
          logical_date?: string
          note?: string | null
          weight_lb_used?: number | null
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
            referencedRelation: "workout_history"
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
          archived_tabs: string[]
          calorie_target: number
          confidence_threshold: number
          context_blurb: string | null
          id: number
          protein_target_g: number
          rest_seconds: number
          timezone: string
        }
        Insert: {
          archived_tabs?: string[]
          calorie_target?: number
          confidence_threshold?: number
          context_blurb?: string | null
          id?: number
          protein_target_g?: number
          rest_seconds?: number
          timezone?: string
        }
        Update: {
          archived_tabs?: string[]
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
          skipped_exercise_ids: string[]
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
          skipped_exercise_ids?: string[]
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
          skipped_exercise_ids?: string[]
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
      callback_counts: {
        Row: {
          kind: string | null
          n: number | null
        }
        Relationships: []
      }
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
      lift_daily: {
        Row: {
          best_reps: number | null
          best_weight: number | null
          e1rm: number | null
          exercise_id: string | null
          logical_date: string | null
          max_reps: number | null
          sets: number | null
          volume: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      open_application_reminders: {
        Row: {
          company: string | null
          created_at: string | null
          id: string | null
          noted_date: string | null
          position: string | null
        }
        Relationships: []
      }
      redo_queue: {
        Row: {
          catalog_id: string | null
          created_at: string | null
          deleted_at: string | null
          difficulty: string | null
          hints: string | null
          id: string | null
          inferred: boolean | null
          logical_date: string | null
          minutes: number | null
          notes: string | null
          redo: boolean | null
          result: string | null
          title: string | null
          topic: string | null
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
      weekly_weights: {
        Row: {
          avg_lb: number | null
          n: number | null
          week_start: string | null
        }
        Relationships: []
      }
      workout_history: {
        Row: {
          ended_at: string | null
          id: string | null
          logical_date: string | null
          minutes: number | null
          plan_id: string | null
          plan_name: string | null
          sets: number | null
          started_at: string | null
          status: string | null
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
    Functions: {
      add_application_reminder: {
        Args: {
          p_company: string
          p_date: string
          p_position: string
          p_tool?: string
        }
        Returns: Json
      }
      add_exercise: {
        Args: { p_aliases?: string[]; p_name: string; p_tool?: string }
        Returns: Json
      }
      add_note: {
        Args: {
          p_body: string
          p_date: string
          p_kind: string
          p_tool?: string
        }
        Returns: Json
      }
      application_for: { Args: { p_company: string }; Returns: string }
      apply_application_reminder: {
        Args: {
          p_date: string
          p_id: string
          p_resume_name?: string
          p_tool?: string
        }
        Returns: Json
      }
      delete_application: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_break: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_callback: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_food: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_food_entry: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_leetcode: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_meal: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_note: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_run: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_set: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_weight: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_workout: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      dismiss_application_reminder: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      is_owner: { Args: never; Returns: boolean }
      lc_lookup: {
        Args: { p_title: string }
        Returns: {
          aliases: string[]
          created_at: string
          difficulty: string
          id: string
          title: string
          topic: string
        }[]
        SetofOptions: {
          from: "*"
          to: "lc_catalog"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      leetcode_counts: {
        Args: { p_from: string; p_to: string }
        Returns: {
          dimension: string
          key: string
          n: number
        }[]
      }
      log_callback: {
        Args: {
          p_company: string
          p_date: string
          p_debrief?: string
          p_kind: string
          p_outcome?: string
          p_score?: string
          p_tool?: string
        }
        Returns: Json
      }
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
      log_food_item: {
        Args: {
          p_date: string
          p_food_id: string
          p_servings?: number
          p_tool?: string
        }
        Returns: Json
      }
      log_leetcode: {
        Args: {
          p_date: string
          p_difficulty?: string
          p_hints?: string
          p_inferred?: boolean
          p_minutes?: number
          p_notes?: string
          p_redo?: boolean
          p_result?: string
          p_title: string
          p_tool?: string
          p_topic?: string
        }
        Returns: Json
      }
      log_run: {
        Args: {
          p_date: string
          p_distance_mi: number
          p_duration_sec: number
          p_note?: string
          p_tool?: string
        }
        Returns: Json
      }
      log_saved_meal: {
        Args: {
          p_date: string
          p_meal_id: string
          p_minus?: Json
          p_portions?: number
          p_tool?: string
        }
        Returns: Json
      }
      log_set: {
        Args: {
          p_exercise_id: string
          p_reps: number
          p_tool?: string
          p_variant?: string
          p_weight_lb?: number
          p_workout_id: string
        }
        Returns: Json
      }
      run_calories: {
        Args: { p_date: string; p_distance_mi: number }
        Returns: {
          calories: number
          weight_lb: number
        }[]
      }
      save_application: {
        Args: {
          p_applied_date: string
          p_company: string
          p_position: string
          p_resume_name?: string
          p_status: string
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
      save_food: {
        Args: {
          p_aliases?: string[]
          p_calories: number
          p_name: string
          p_protein_g: number
          p_serving_amount: number
          p_serving_unit: string
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
      set_debrief: {
        Args: { p_debrief: string; p_id: string; p_tool?: string }
        Returns: Json
      }
      set_exercise_skipped: {
        Args: {
          p_exercise_id: string
          p_skipped: boolean
          p_tool?: string
          p_workout_id: string
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
      set_leetcode_redo: {
        Args: { p_id: string; p_redo: boolean; p_tool?: string }
        Returns: Json
      }
      set_meal_items: {
        Args: { p_items: Json; p_meal_id: string; p_tool?: string }
        Returns: Json
      }
      set_note_body: {
        Args: { p_body: string; p_id: string; p_tool?: string }
        Returns: Json
      }
      set_tab_archived: {
        Args: { p_archived: boolean; p_tab: string; p_tool?: string }
        Returns: Json
      }
      set_targets: {
        Args: {
          p_calories: number
          p_date: string
          p_protein_g: number
          p_tool?: string
        }
        Returns: Json
      }
      start_workout: {
        Args: { p_date: string; p_plan_id: string; p_tool?: string }
        Returns: Json
      }
      targets_for: {
        Args: { p_date: string }
        Returns: {
          calorie_target: number
          protein_target_g: number
        }[]
      }
      undo_action: { Args: { p_action_id?: string }; Returns: Json }
      undoable_table: { Args: { p_table: string }; Returns: boolean }
      update_application: {
        Args: {
          p_applied_date: string
          p_company: string
          p_id: string
          p_position: string
          p_resume_name: string
          p_status: string
          p_tool?: string
        }
        Returns: Json
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
      update_callback: {
        Args: {
          p_company: string
          p_date: string
          p_id: string
          p_kind: string
          p_outcome: string
          p_score: string
          p_tool?: string
        }
        Returns: Json
      }
      update_food: {
        Args: {
          p_aliases: string[]
          p_calories: number
          p_id: string
          p_name: string
          p_protein_g: number
          p_serving_amount: number
          p_serving_unit: string
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
      update_leetcode: {
        Args: {
          p_date: string
          p_difficulty: string
          p_hints: string
          p_id: string
          p_minutes: number
          p_notes: string
          p_redo: boolean
          p_result: string
          p_title: string
          p_tool?: string
          p_topic: string
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
      update_run: {
        Args: {
          p_date: string
          p_distance_mi: number
          p_duration_sec: number
          p_id: string
          p_note: string
          p_tool?: string
        }
        Returns: Json
      }
      update_set: {
        Args: {
          p_id: string
          p_reps: number
          p_tool?: string
          p_variant: string
          p_weight_lb: number
        }
        Returns: Json
      }
      update_settings: {
        Args: { p_changes: Json; p_tool?: string }
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
      update_workout: {
        Args: {
          p_date: string
          p_ended_at: string
          p_id: string
          p_started_at: string
          p_status: string
          p_tool?: string
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
