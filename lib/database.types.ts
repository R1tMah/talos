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
      api_usage: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          id?: string
          input_tokens: number
          model: string
          output_tokens: number
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
        }
        Relationships: []
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
      checking_balances: {
        Row: {
          balance: number
          created_at: string
          deleted_at: string | null
          id: string
          logical_date: string
          plaid_item: string | null
        }
        Insert: {
          balance: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          logical_date: string
          plaid_item?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          logical_date?: string
          plaid_item?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checking_balances_plaid_item_fkey"
            columns: ["plaid_item"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_modules: {
        Row: {
          bullets: string[]
          completed_at: string | null
          completed_by: string | null
          created_at: string
          curriculum_id: string
          diagram: string
          diagram_caption: string | null
          id: string
          objective: string
          opening_question: string
          position: number
          replaced_at: string | null
          scheduled_date: string | null
          title: string
        }
        Insert: {
          bullets: string[]
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          curriculum_id: string
          diagram: string
          diagram_caption?: string | null
          id?: string
          objective: string
          opening_question: string
          position: number
          replaced_at?: string | null
          scheduled_date?: string | null
          title: string
        }
        Update: {
          bullets?: string[]
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          curriculum_id?: string
          diagram?: string
          diagram_caption?: string | null
          id?: string
          objective?: string
          opening_question?: string
          position?: number
          replaced_at?: string | null
          scheduled_date?: string | null
          title?: string
        }
        Relationships: []
      }
      curriculums: {
        Row: {
          cadence: number[]
          context: string
          created_at: string
          deleted_at: string | null
          error: string | null
          goal: string | null
          id: string
          status: string
          target_date: string | null
          title: string | null
          topic: string
        }
        Insert: {
          cadence: number[]
          context?: string
          created_at?: string
          deleted_at?: string | null
          error?: string | null
          goal?: string | null
          id?: string
          status?: string
          target_date?: string | null
          title?: string | null
          topic: string
        }
        Update: {
          cadence?: number[]
          context?: string
          created_at?: string
          deleted_at?: string | null
          error?: string | null
          goal?: string | null
          id?: string
          status?: string
          target_date?: string | null
          title?: string | null
          topic?: string
        }
        Relationships: []
      }
      eod_questions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          position: number
          prompt: string
          target: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          position?: number
          prompt: string
          target: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          position?: number
          prompt?: string
          target?: string
        }
        Relationships: []
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
      finance_transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          logical_date: string
          note: string | null
          pending: boolean
          plaid_item: string | null
          plaid_transaction_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          logical_date: string
          note?: string | null
          pending?: boolean
          plaid_item?: string | null
          plaid_transaction_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          logical_date?: string
          note?: string | null
          pending?: boolean
          plaid_item?: string | null
          plaid_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_transactions_plaid_item_fkey"
            columns: ["plaid_item"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
        ]
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
      future_letters: {
        Row: {
          body: string
          created_at: string
          deliver_at: string
          email_error: string | null
          emailed_at: string | null
          id: string
          opened_at: string | null
          written_at: string
        }
        Insert: {
          body: string
          created_at?: string
          deliver_at: string
          email_error?: string | null
          emailed_at?: string | null
          id?: string
          opened_at?: string | null
          written_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          deliver_at?: string
          email_error?: string | null
          emailed_at?: string | null
          id?: string
          opened_at?: string | null
          written_at?: string
        }
        Relationships: []
      }
      google_auth: {
        Row: {
          email: string | null
          id: number
          refresh_token: string
          scope: string
          updated_at: string
        }
        Insert: {
          email?: string | null
          id?: number
          refresh_token: string
          scope: string
          updated_at?: string
        }
        Update: {
          email?: string | null
          id?: number
          refresh_token?: string
          scope?: string
          updated_at?: string
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
      message_followups: {
        Row: {
          cards: Json
          created_at: string
          id: string
          message_id: string
        }
        Insert: {
          cards: Json
          created_at?: string
          id?: string
          message_id: string
        }
        Update: {
          cards?: Json
          created_at?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_followups_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "message_log"
            referencedColumns: ["id"]
          },
        ]
      }
      message_log: {
        Row: {
          client_msg_id: string
          corrected: boolean
          corrected_tab: string | null
          created_at: string
          id: string
          model: string | null
          response: Json | null
          route: string | null
          tab: string | null
          text: string
          tool_calls: Json | null
        }
        Insert: {
          client_msg_id: string
          corrected?: boolean
          corrected_tab?: string | null
          created_at?: string
          id?: string
          model?: string | null
          response?: Json | null
          route?: string | null
          tab?: string | null
          text: string
          tool_calls?: Json | null
        }
        Update: {
          client_msg_id?: string
          corrected?: boolean
          corrected_tab?: string | null
          created_at?: string
          id?: string
          model?: string | null
          response?: Json | null
          route?: string | null
          tab?: string | null
          text?: string
          tool_calls?: Json | null
        }
        Relationships: []
      }
      module_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          module_id: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          module_id: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          module_id?: string
          role?: string
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          checking: number | null
          created_at: string
          snapshot_date: string
          total: number
          vanguard: number | null
        }
        Insert: {
          checking?: number | null
          created_at?: string
          snapshot_date: string
          total: number
          vanguard?: number | null
        }
        Update: {
          checking?: number | null
          created_at?: string
          snapshot_date?: string
          total?: number
          vanguard?: number | null
        }
        Relationships: []
      }
      notes: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          done_at: string | null
          id: string
          kind: string
          logical_date: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          done_at?: string | null
          id?: string
          kind: string
          logical_date: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          done_at?: string | null
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
      plaid_items: {
        Row: {
          access_token: string
          created_at: string
          cursor: string | null
          env: string
          error_code: string | null
          id: string
          institution_name: string | null
          item_id: string
          kind: string
          last_synced_at: string | null
          status: string
        }
        Insert: {
          access_token: string
          created_at?: string
          cursor?: string | null
          env: string
          error_code?: string | null
          id?: string
          institution_name?: string | null
          item_id: string
          kind: string
          last_synced_at?: string | null
          status?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          cursor?: string | null
          env?: string
          error_code?: string | null
          id?: string
          institution_name?: string | null
          item_id?: string
          kind?: string
          last_synced_at?: string | null
          status?: string
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
      prep_completions: {
        Row: {
          curriculum_id: string
          done_at: string
          session: number
        }
        Insert: {
          curriculum_id: string
          done_at?: string
          session: number
        }
        Update: {
          curriculum_id?: string
          done_at?: string
          session?: number
        }
        Relationships: []
      }
      reminders: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          done_at: string | null
          due_date: string | null
          id: string
          noted_date: string
          surface_date: string | null
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          done_at?: string | null
          due_date?: string | null
          id?: string
          noted_date: string
          surface_date?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          done_at?: string | null
          due_date?: string | null
          id?: string
          noted_date?: string
          surface_date?: string | null
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
          price: number | null
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
          price?: number | null
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
          price?: number | null
          protein_g?: number
        }
        Relationships: []
      }
      season_notes: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          label: string | null
          noted_on: string | null
          position: number
          season_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string | null
          noted_on?: string | null
          position: number
          season_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string | null
          noted_on?: string | null
          position?: number
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_notes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          plan: string
          position: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          plan?: string
          position: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          plan?: string
          position?: number
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
      spending: {
        Row: {
          amount: number
          category: string
          created_at: string
          deleted_at: string | null
          finance_transaction_id: string | null
          food_log_id: string | null
          id: string
          logical_date: string
          note: string | null
          what: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          finance_transaction_id?: string | null
          food_log_id?: string | null
          id?: string
          logical_date: string
          note?: string | null
          what: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          finance_transaction_id?: string | null
          food_log_id?: string | null
          id?: string
          logical_date?: string
          note?: string | null
          what?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number
          cadence: string
          cancelled_on: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          note: string | null
          started_on: string
        }
        Insert: {
          amount: number
          cadence: string
          cancelled_on?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          note?: string | null
          started_on: string
        }
        Update: {
          amount?: number
          cadence?: string
          cancelled_on?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          note?: string | null
          started_on?: string
        }
        Relationships: []
      }
      vanguard_holdings: {
        Row: {
          created_at: string
          deleted_at: string | null
          fund: string
          id: string
          plaid_item: string | null
          plaid_key: string | null
          shares: number
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          fund: string
          id?: string
          plaid_item?: string | null
          plaid_key?: string | null
          shares: number
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          fund?: string
          id?: string
          plaid_item?: string | null
          plaid_key?: string | null
          shares?: number
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "vanguard_holdings_plaid_item_fkey"
            columns: ["plaid_item"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_items: {
        Row: {
          closed_at: string | null
          data: Json
          first_seen: string
          key: string
          source_id: string
        }
        Insert: {
          closed_at?: string | null
          data: Json
          first_seen?: string
          key: string
          source_id: string
        }
        Update: {
          closed_at?: string | null
          data?: Json
          first_seen?: string
          key?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "watch_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_sources: {
        Row: {
          config: Json
          created_at: string
          data: Json | null
          enabled: boolean
          error: string | null
          every_minutes: number
          fetched_at: string | null
          id: string
          kind: string
          position: number
          seen_at: string | null
          title: string
          tried_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          data?: Json | null
          enabled?: boolean
          error?: string | null
          every_minutes?: number
          fetched_at?: string | null
          id?: string
          kind: string
          position?: number
          seen_at?: string | null
          title: string
          tried_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          data?: Json | null
          enabled?: boolean
          error?: string | null
          every_minutes?: number
          fetched_at?: string | null
          id?: string
          kind?: string
          position?: number
          seen_at?: string | null
          title?: string
          tried_at?: string | null
        }
        Relationships: []
      }
      mock_answers: {
        Row: {
          content_score: number
          created_at: string
          duration_seconds: number
          feedback: Json
          final_score: number
          id: string
          model: string
          question_id: string
          target_time_seconds: number
          transcription: string
          yap_penalty: number
        }
        Insert: {
          content_score: number
          created_at?: string
          duration_seconds: number
          feedback: Json
          final_score: number
          id?: string
          model: string
          question_id: string
          target_time_seconds: number
          transcription: string
          yap_penalty: number
        }
        Update: {
          content_score?: number
          created_at?: string
          duration_seconds?: number
          feedback?: Json
          final_score?: number
          id?: string
          model?: string
          question_id?: string
          target_time_seconds?: number
          transcription?: string
          yap_penalty?: number
        }
        Relationships: [
          {
            foreignKeyName: "mock_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mock_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_questions: {
        Row: {
          area: string
          created_at: string
          id: string
          model: string
          position: number
          question: string
          rubric: Json
          session_id: string
          target_time_seconds: number
        }
        Insert: {
          area: string
          created_at?: string
          id?: string
          model: string
          position: number
          question: string
          rubric: Json
          session_id: string
          target_time_seconds: number
        }
        Update: {
          area?: string
          created_at?: string
          id?: string
          model?: string
          position?: number
          question?: string
          rubric?: Json
          session_id?: string
          target_time_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "mock_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mock_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_sessions: {
        Row: {
          company: string
          context: string
          created_at: string
          deleted_at: string | null
          id: string
          include_fit: boolean
          pdf_name: string | null
          role: string
        }
        Insert: {
          company?: string
          context?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          include_fit?: boolean
          pdf_name?: string | null
          role: string
        }
        Update: {
          company?: string
          context?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          include_fit?: boolean
          pdf_name?: string | null
          role?: string
        }
        Relationships: []
      }
      mock_settings: {
        Row: {
          architect_model: string
          grader_model: string
          id: number
          updated_at: string
        }
        Insert: {
          architect_model?: string
          grader_model?: string
          id?: number
          updated_at?: string
        }
        Update: {
          architect_model?: string
          grader_model?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      weekly_email: {
        Row: {
          enabled: boolean
          hide_empty: boolean
          id: number
          last_error: string | null
          last_sent_on: string | null
          sections: string[]
          send_day: number
          send_hour: number
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          hide_empty?: boolean
          id?: number
          last_error?: string | null
          last_sent_on?: string | null
          sections?: string[]
          send_day?: number
          send_hour?: number
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          hide_empty?: boolean
          id?: number
          last_error?: string | null
          last_sent_on?: string | null
          sections?: string[]
          send_day?: number
          send_hour?: number
          updated_at?: string
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
      open_long_term_reminders: {
        Row: {
          body: string | null
          created_at: string | null
          due_date: string | null
          id: string | null
          noted_date: string | null
          surface_date: string | null
          surfaced: boolean | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          noted_date?: string | null
          surface_date?: string | null
          surfaced?: boolean | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          noted_date?: string | null
          surface_date?: string | null
          surfaced?: boolean | null
        }
        Relationships: []
      }
      open_reminders: {
        Row: {
          body: string | null
          created_at: string | null
          due_date: string | null
          id: string | null
          noted_date: string | null
          surface_date: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          noted_date?: string | null
          surface_date?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          noted_date?: string | null
          surface_date?: string | null
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
      owner_today: { Args: never; Returns: string }
      opened_letters: {
        Args: never
        Returns: {
          body: string
          deliver_at: string
          email_error: string | null
          emailed_at: string | null
          id: string
          opened_at: string
          written_at: string
        }[]
      }
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
      add_holding: {
        Args: {
          p_fund: string
          p_shares: number
          p_tool?: string
          p_value: number
        }
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
      add_phase: {
        Args: {
          p_calories: number
          p_description: string
          p_end: string
          p_name: string
          p_protein: number
          p_start: string
          p_tool?: string
        }
        Returns: Json
      }
      add_reminder: {
        Args: {
          p_body: string
          p_date: string
          p_due: string
          p_surface?: string
          p_tool?: string
        }
        Returns: Json
      }
      add_scheduled_reminder: { Args: { p_body: string }; Returns: Json }
      add_season: {
        Args: { p_name: string; p_plan: string; p_tool?: string }
        Returns: Json
      }
      add_season_note: {
        Args: {
          p_body: string
          p_date: string
          p_label: string
          p_season_id: string
          p_tool?: string
        }
        Returns: Json
      }
      add_subscription: {
        Args: {
          p_amount: number
          p_cadence: string
          p_date: string
          p_name: string
          p_note?: string
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
      chat_day: {
        Args: { p_day: string }
        Returns: {
          created_at: string
          followups: Json
          id: string
          response: Json
          tab: string
          text: string
        }[]
      }
      chat_days: {
        Args: never
        Returns: {
          day: string
          n: number
        }[]
      }
      check_phase: {
        Args: {
          p_calories: number
          p_end: string
          p_protein: number
          p_start: string
        }
        Returns: string
      }
      complete_reminder: {
        Args: { p_id: string; p_tool?: string }
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
      delete_checking_balance: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_food: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_food_entry: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_holding: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_leetcode: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_meal: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_note: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_phase: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_run: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_season_note: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_set: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_spending: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_subscription: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_transaction: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      delete_weight: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      delete_workout: { Args: { p_id: string; p_tool?: string }; Returns: Json }
      dismiss_application_reminder: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      dismiss_reminder: {
        Args: { p_id: string; p_tool?: string }
        Returns: Json
      }
      finance_snapshot: { Args: never; Returns: undefined }
      google_status: {
        Args: never
        Returns: {
          email: string
          scope: string
          updated_at: string
        }[]
      }
      is_owner: { Args: never; Returns: boolean }
      lc_add_alias: {
        Args: { p_alias: string; p_title: string }
        Returns: Json
      }
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
          p_spend?: boolean
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
      spend_transaction: {
        Args: {
          p_amount: number
          p_category?: string
          p_date: string
          p_note?: string
          p_tool?: string
          p_transaction_id: string
          p_what: string
        }
        Returns: Json
      }
      log_spending: {
        Args: {
          p_amount: number
          p_category?: string
          p_date: string
          p_note?: string
          p_tool?: string
          p_what: string
        }
        Returns: Json
      }
      log_transaction: {
        Args: {
          p_amount: number
          p_category?: string
          p_date: string
          p_description: string
          p_note?: string
          p_tool?: string
        }
        Returns: Json
      }
      phase_overlap: {
        Args: { p_end: string; p_except: string; p_start: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "phases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      plaid_status: {
        Args: never
        Returns: {
          env: string
          error_code: string
          id: string
          institution_name: string
          kind: string
          last_synced_at: string
          status: string
        }[]
      }
      plaid_sync_tick: { Args: never; Returns: number }
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
          p_price?: number
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
      set_checking_balance: {
        Args: { p_balance: number; p_date: string; p_tool?: string }
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
      set_note_done: {
        Args: { p_done: boolean; p_id: string; p_tool?: string }
        Returns: Json
      }
      set_subscription_cancelled: {
        Args: { p_date: string; p_id: string; p_tool?: string }
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
      update_holding: {
        Args: {
          p_fund: string
          p_id: string
          p_shares: number
          p_tool?: string
          p_value: number
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
          p_price?: number
          p_tool?: string
        }
        Returns: Json
      }
      update_phase: {
        Args: {
          p_calories: number
          p_description: string
          p_end: string
          p_id: string
          p_name: string
          p_protein: number
          p_start: string
          p_tool?: string
        }
        Returns: Json
      }
      update_reminder: {
        Args: {
          p_body: string
          p_due: string
          p_id: string
          p_surface?: string
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
      update_season: {
        Args: { p_id: string; p_name: string; p_plan: string; p_tool?: string }
        Returns: Json
      }
      update_season_note: {
        Args: {
          p_body: string
          p_date: string
          p_id: string
          p_label: string
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
      update_spending: {
        Args: {
          p_amount: number
          p_category: string
          p_date: string
          p_id: string
          p_note: string
          p_tool?: string
          p_what: string
        }
        Returns: Json
      }
      update_subscription: {
        Args: {
          p_amount: number
          p_cadence: string
          p_date: string
          p_id: string
          p_name: string
          p_note: string
          p_tool?: string
        }
        Returns: Json
      }
      update_transaction: {
        Args: {
          p_amount: number
          p_category: string
          p_date: string
          p_description: string
          p_id: string
          p_note: string
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
      watch_tick: { Args: never; Returns: number }
      watch_tick_kind: { Args: { p_kind: string }; Returns: number }
      weekly_email_tick: { Args: never; Returns: number }
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
