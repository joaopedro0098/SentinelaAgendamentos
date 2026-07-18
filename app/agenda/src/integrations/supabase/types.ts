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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          barbearia_id: string
          barbeiro_id: string
          cancel_reason: string | null
          cliente_id: string | null
          client_confirmed_at: string | null
          cliente_nome: string
          cliente_whatsapp: string
          confirmation_push_sent_at: string | null
          confirmation_token: string
          created_at: string
          data: string
          duracao_minutos: number
          hora: string
          id: string
          messaging_consent_at: string | null
          messaging_consent_text: string | null
          observacao: string | null
          reminder_push_sent_at: string | null
          requires_client_confirmation: boolean
          service_id: string | null
          servicos_nomes: string[]
          status: Database["public"]["Enums"]["agendamento_status"]
        }
        Insert: {
          barbearia_id: string
          barbeiro_id: string
          cancel_reason?: string | null
          cliente_id?: string | null
          client_confirmed_at?: string | null
          cliente_nome: string
          cliente_whatsapp: string
          confirmation_push_sent_at?: string | null
          confirmation_token?: string
          created_at?: string
          data: string
          duracao_minutos?: number
          hora: string
          id?: string
          messaging_consent_at?: string | null
          messaging_consent_text?: string | null
          observacao?: string | null
          reminder_push_sent_at?: string | null
          requires_client_confirmation?: boolean
          service_id?: string | null
          servicos_nomes?: string[]
          status?: Database["public"]["Enums"]["agendamento_status"]
        }
        Update: {
          barbearia_id?: string
          barbeiro_id?: string
          cancel_reason?: string | null
          cliente_id?: string | null
          client_confirmed_at?: string | null
          cliente_nome?: string
          cliente_whatsapp?: string
          confirmation_push_sent_at?: string | null
          confirmation_token?: string
          created_at?: string
          data?: string
          duracao_minutos?: number
          hora?: string
          id?: string
          messaging_consent_at?: string | null
          messaging_consent_text?: string | null
          observacao?: string | null
          reminder_push_sent_at?: string | null
          requires_client_confirmation?: boolean
          service_id?: string | null
          servicos_nomes?: string[]
          status?: Database["public"]["Enums"]["agendamento_status"]
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      barbearias: {
        Row: {
          ativa: boolean
          created_at: string
          endereco: string | null
          horarios_funcionamento: Json
          id: string
          limite_clientes_mensais: number
          logo_url: string | null
          mp_subscription_id: string | null
          nome: string
          owner_id: string | null
          plano: Database["public"]["Enums"]["plano_tipo"]
          plano_status: string
          slug: string
          telefone: string | null
          trial_iniciado_em: string | null
          updated_at: string
          whatsapp_business_id: string | null
          whatsapp_phone_number_id: string | null
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          endereco?: string | null
          horarios_funcionamento?: Json
          id?: string
          limite_clientes_mensais?: number
          logo_url?: string | null
          mp_subscription_id?: string | null
          nome: string
          owner_id?: string | null
          plano?: Database["public"]["Enums"]["plano_tipo"]
          plano_status?: string
          slug: string
          telefone?: string | null
          trial_iniciado_em?: string | null
          updated_at?: string
          whatsapp_business_id?: string | null
          whatsapp_phone_number_id?: string | null
        }
        Update: {
          ativa?: boolean
          created_at?: string
          endereco?: string | null
          horarios_funcionamento?: Json
          id?: string
          limite_clientes_mensais?: number
          logo_url?: string | null
          mp_subscription_id?: string | null
          nome?: string
          owner_id?: string | null
          plano?: Database["public"]["Enums"]["plano_tipo"]
          plano_status?: string
          slug?: string
          telefone?: string | null
          trial_iniciado_em?: string | null
          updated_at?: string
          whatsapp_business_id?: string | null
          whatsapp_phone_number_id?: string | null
        }
        Relationships: []
      }
      barbeiro_services: {
        Row: {
          ativo: boolean
          barbeiro_id: string
          created_at: string
          duracao_minutos: number
          id: string
          nome: string
          preco_centavos: number
        }
        Insert: {
          ativo?: boolean
          barbeiro_id: string
          created_at?: string
          duracao_minutos: number
          id?: string
          nome: string
          preco_centavos?: number
        }
        Update: {
          ativo?: boolean
          barbeiro_id?: string
          created_at?: string
          duracao_minutos?: number
          id?: string
          nome?: string
          preco_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "barbeiro_services_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
        ]
      }
      barbeiros: {
        Row: {
          ativo: boolean
          barbearia_id: string
          created_at: string
          foto_url: string | null
          id: string
          nome: string
          slot_minutos: number
        }
        Insert: {
          ativo?: boolean
          barbearia_id: string
          created_at?: string
          foto_url?: string | null
          id?: string
          nome: string
          slot_minutos?: number
        }
        Update: {
          ativo?: boolean
          barbearia_id?: string
          created_at?: string
          foto_url?: string | null
          id?: string
          nome?: string
          slot_minutos?: number
        }
        Relationships: [
          {
            foreignKeyName: "barbeiros_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
        ]
      }
      bloqueios: {
        Row: {
          barbeiro_id: string
          created_at: string
          data: string
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          motivo: string | null
        }
        Insert: {
          barbeiro_id: string
          created_at?: string
          data: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          motivo?: string | null
        }
        Update: {
          barbeiro_id?: string
          created_at?: string
          data?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bloqueios_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          barbearia_id: string
          created_at: string
          id: string
          nome: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          barbearia_id: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          barbearia_id?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
        ]
      }
      disponibilidades: {
        Row: {
          barbeiro_id: string
          created_at: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
        }
        Insert: {
          barbeiro_id: string
          created_at?: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
        }
        Update: {
          barbeiro_id?: string
          created_at?: string
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidades_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados: {
        Row: {
          barbearia_id: string
          created_at: string
          data: string
          dia_inteiro: boolean
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          nome: string | null
        }
        Insert: {
          barbearia_id: string
          created_at?: string
          data: string
          dia_inteiro?: boolean
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          nome?: string | null
        }
        Update: {
          barbearia_id?: string
          created_at?: string
          data?: string
          dia_inteiro?: boolean
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feriados_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          limite_clientes_mensais: number
          mp_plan_id: string
          nome_exibicao: string
          preco: number
          tipo: Database["public"]["Enums"]["plano_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          limite_clientes_mensais?: number
          mp_plan_id: string
          nome_exibicao: string
          preco?: number
          tipo: Database["public"]["Enums"]["plano_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          limite_clientes_mensais?: number
          mp_plan_id?: string
          nome_exibicao?: string
          preco?: number
          tipo?: Database["public"]["Enums"]["plano_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          ativo: boolean
          barbearia_id: string
          created_at: string
          duracao_minutos: number
          id: string
          nome: string
          preco: number
        }
        Insert: {
          ativo?: boolean
          barbearia_id: string
          created_at?: string
          duracao_minutos?: number
          id?: string
          nome: string
          preco?: number
        }
        Update: {
          ativo?: boolean
          barbearia_id?: string
          created_at?: string
          duracao_minutos?: number
          id?: string
          nome?: string
          preco?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      barbearia_dentro_do_limite: {
        Args: { _barbearia_id: string }
        Returns: boolean
      }
      cancelar_agendamento_cliente: {
        Args: { _agendamento_id: string; _slug: string; _whatsapp: string }
        Returns: boolean
      }
      ensure_current_user_barbearia: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reagendar_agendamento: {
        Args: {
          p_agendamento_id: string
          p_data: string
          p_hora: string
          p_barbeiro_id: string
          p_duracao_minutos: number
          p_observacao?: string | null
          p_servicos_nomes?: string[] | null
        }
        Returns: undefined
      }
      excluir_agendamento_painel: {
        Args: { p_agendamento_id: string }
        Returns: undefined
      }
      confirmar_presenca_agendamento_painel: {
        Args: { p_agendamento_id: string }
        Returns: string
      }
      set_allow_client_self_service: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      set_allow_client_public_booking: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      get_client_confirmation_push_status: {
        Args: { _slug: string; _whatsapp: string }
        Returns: {
          confirmation_token: string
          needs_resubscribe: boolean
        }[]
      }
      listar_agendamentos_cliente: {
        Args: { _slug: string; _whatsapp: string }
        Returns: {
          allow_client_public_booking: boolean
          allow_client_self_service: boolean
          barbearia_nome: string
          barbeiro_id: string
          barbeiro_nome: string
          cliente_nome: string
          data: string
          duracao_minutos: number
          hora: string
          id: string
          messaging_consent_at: string | null
          messaging_consent_text: string | null
          observacao: string | null
          servicos_nomes: string[]
          status: Database["public"]["Enums"]["agendamento_status"]
        }[]
      }
      upsert_cliente_por_whatsapp: {
        Args: { _barbearia_id: string; _nome: string; _whatsapp: string }
        Returns: string
      }
      get_cliente_cadastro_por_whatsapp: {
        Args: { p_barbearia_id: string; p_whatsapp: string }
        Returns: Json
      }
      user_barbearia_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      agendamento_status: "confirmado" | "cancelado" | "concluido"
      app_role: "master" | "barbeiro"
      plano_tipo: "basico" | "intermediario" | "avancado"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agendamento_status: ["confirmado", "cancelado", "concluido"],
      app_role: ["master", "barbeiro"],
      plano_tipo: ["basico", "intermediario", "avancado"],
    },
  },
} as const
