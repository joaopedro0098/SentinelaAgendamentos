node.exe : npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm 
help npmrc` for supported config options.
No linha:1 caractere:1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (npm warn Unknow...config options.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
Initialising login role...
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
      agendamento_anotacoes: {
        Row: {
          agendamento_id: string
          archived_at: string | null
          archived_by: string | null
          conteudo: string
          created_at: string
          created_by: string | null
          id: string
          titular_user_id: string
          updated_at: string
        }
        Insert: {
          agendamento_id: string
          archived_at?: string | null
          archived_by?: string | null
          conteudo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          titular_user_id: string
          updated_at?: string
        }
        Update: {
          agendamento_id?: string
          archived_at?: string | null
          archived_by?: string | null
          conteudo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          titular_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_anotacoes_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: true
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          barbearia_id: string | null
          barbeiro_id: string | null
          barber_new_booking_push_sent_at: string | null
          cancel_reason: string | null
          cancelado_por: string | null
          client_confirmed_at: string | null
          cliente_id: string | null
          cliente_nome: string
          cliente_whatsapp: string
          confirmation_push_sent_at: string | null
          confirmation_token: string
          created_at: string
          data: string
          duracao_minutos: number
          hora: string
          id: string
          installment_count: number | null
          mp_payment_id: string | null
          observacao: string | null
          origem: string
          payment_expires_at: string | null
          payment_status:
            | Database["public"]["Enums"]["appointment_payment_status"]
            | null
          reminder_3h_sent_at: string | null
          reminder_push_sent_at: string | null
          reminder_whatsapp_sent_at: string | null
          requires_client_confirmation: boolean
          servicos_nomes: string[]
          status: Database["public"]["Enums"]["agendamento_status"]
          titular_user_id: string
          valor_base_centavos: number | null
          valor_cobranca_base_centavos: number | null
          valor_pago_centavos: number | null
          valor_restante_centavos: number | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          barbearia_id?: string | null
          barbeiro_id?: string | null
          barber_new_booking_push_sent_at?: string | null
          cancel_reason?: string | null
          cancelado_por?: string | null
          client_confirmed_at?: string | null
          cliente_id?: string | null
          cliente_nome: string
          cliente_whatsapp: string
          confirmation_push_sent_at?: string | null
          confirmation_token?: string
          created_at?: string
          data: string
          duracao_minutos?: number
          hora: string
          id?: string
          installment_count?: number | null
          mp_payment_id?: string | null
          observacao?: string | null
          origem?: string
          payment_expires_at?: string | null
          payment_status?:
            | Database["public"]["Enums"]["appointment_payment_status"]
            | null
          reminder_3h_sent_at?: string | null
          reminder_push_sent_at?: string | null
          reminder_whatsapp_sent_at?: string | null
          requires_client_confirmation?: boolean
          servicos_nomes?: string[]
          status?: Database["public"]["Enums"]["agendamento_status"]
          titular_user_id: string
          valor_base_centavos?: number | null
          valor_cobranca_base_centavos?: number | null
          valor_pago_centavos?: number | null
          valor_restante_centavos?: number | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          barbearia_id?: string | null
          barbeiro_id?: string | null
          barber_new_booking_push_sent_at?: string | null
          cancel_reason?: string | null
          cancelado_por?: string | null
          client_confirmed_at?: string | null
          cliente_id?: string | null
          cliente_nome?: string
          cliente_whatsapp?: string
          confirmation_push_sent_at?: string | null
          confirmation_token?: string
          created_at?: string
          data?: string
          duracao_minutos?: number
          hora?: string
          id?: string
          installment_count?: number | null
          mp_payment_id?: string | null
          observacao?: string | null
          origem?: string
          payment_expires_at?: string | null
          payment_status?:
            | Database["public"]["Enums"]["appointment_payment_status"]
            | null
          reminder_3h_sent_at?: string | null
          reminder_push_sent_at?: string | null
          reminder_whatsapp_sent_at?: string | null
          requires_client_confirmation?: boolean
          servicos_nomes?: string[]
          status?: Database["public"]["Enums"]["agendamento_status"]
          titular_user_id?: string
          valor_base_centavos?: number | null
          valor_cobranca_base_centavos?: number | null
          valor_pago_centavos?: number | null
          valor_restante_centavos?: number | null
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
        ]
      }
      aggregated_accounts: {
        Row: {
          activated_at: string | null
          aggregated_user_id: string | null
          email: string
          id: string
          invited_at: string
          owner_can_edit_appointments: boolean
          owner_can_view_annotations: boolean
          owner_can_view_appointments: boolean
          owner_user_id: string
          removed_at: string | null
          status: Database["public"]["Enums"]["aggregated_account_status"]
        }
        Insert: {
          activated_at?: string | null
          aggregated_user_id?: string | null
          email: string
          id?: string
          invited_at?: string
          owner_can_edit_appointments?: boolean
          owner_can_view_annotations?: boolean
          owner_can_view_appointments?: boolean
          owner_user_id: string
          removed_at?: string | null
          status?: Database["public"]["Enums"]["aggregated_account_status"]
        }
        Update: {
          activated_at?: string | null
          aggregated_user_id?: string | null
          email?: string
          id?: string
          invited_at?: string
          owner_can_edit_appointments?: boolean
          owner_can_view_annotations?: boolean
          owner_can_view_appointments?: boolean
          owner_user_id?: string
          removed_at?: string | null
          status?: Database["public"]["Enums"]["aggregated_account_status"]
        }
        Relationships: []
      }
      alertas_agendamento: {
        Row: {
          agendamento_id: string
          barbearia_id: string
          barbeiro_id: string | null
          billing_registrado_em: string | null
          criado_em: string
          external_message_id: string | null
          id: string
          mensagem: string
          mensagem_profissional_enviada_em: string | null
          provider: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          resolvido_em: string | null
          status: string
          tipo: string
        }
        Insert: {
          agendamento_id: string
          barbearia_id: string
          barbeiro_id?: string | null
          billing_registrado_em?: string | null
          criado_em?: string
          external_message_id?: string | null
          id?: string
          mensagem: string
          mensagem_profissional_enviada_em?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          resolvido_em?: string | null
          status?: string
          tipo: string
        }
        Update: {
          agendamento_id?: string
          barbearia_id?: string
          barbeiro_id?: string | null
          billing_registrado_em?: string | null
          criado_em?: string
          external_message_id?: string | null
          id?: string
          mensagem?: string
          mensagem_profissional_enviada_em?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          resolvido_em?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_agendamento_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_agendamento_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_agendamento_barbeiro_id_fkey"
            columns: ["barbeiro_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_integracao: {
        Row: {
          atualizado_em: string
          barbearia_id: string | null
          codigo: string
          criado_em: string
          dispensado_em: string | null
          id: string
          integracao: string
          mensagem: string
          mensagem_acao: string | null
          reaberto_em: string | null
          resolvido_em: string | null
          severidade: string
          status: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          barbearia_id?: string | null
          codigo: string
          criado_em?: string
          dispensado_em?: string | null
          id?: string
          integracao: string
          mensagem: string
          mensagem_acao?: string | null
          reaberto_em?: string | null
          resolvido_em?: string | null
          severidade?: string
          status?: string
          titulo: string
        }
        Update: {
          atualizado_em?: string
          barbearia_id?: string | null
          codigo?: string
          criado_em?: string
          dispensado_em?: string | null
          id?: string
          integracao?: string
          mensagem?: string
          mensagem_acao?: string | null
          reaberto_em?: string | null
          resolvido_em?: string | null
          severidade?: string
          status?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_integracao_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_push_subscriptions: {
        Row: {
          agendamento_id: string
          auth: string
          created_at: string
          endpoint: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          agendamento_id: string
          auth: string
          created_at?: string
          endpoint: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          agendamento_id?: string
          auth?: string
          created_at?: string
          endpoint?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_push_subscriptions_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      barbearias: {
        Row: {
          allow_client_public_booking: boolean
          allow_client_self_service: boolean
          ativa: boolean
          created_at: string
          id: string
          limite_clientes_mensais: number
          logo_url: string | null
          nome: string
          owner_id: string | null
          show_service_prices: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          allow_client_public_booking?: boolean
          allow_client_self_service?: boolean
          ativa?: boolean
          created_at?: string
          id?: string
          limite_clientes_mensais?: number
          logo_url?: string | null
          nome: string
          owner_id?: string | null
          show_service_prices?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          allow_client_public_booking?: boolean
          allow_client_self_service?: boolean
          ativa?: boolean
          created_at?: string
          id?: string
          limite_clientes_mensais?: number
          logo_url?: string | null
          nome?: string
          owner_id?: string | null
          show_service_prices?: boolean
          slug?: string
          updated_at?: string
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
          duracao_minutos?: number
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
          staff_id: string | null
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean
          barbearia_id: string
          created_at?: string
          foto_url?: string | null
          id?: string
          nome: string
          slot_minutos?: number
          staff_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean
          barbearia_id?: string
          created_at?: string
          foto_url?: string | null
          id?: string
          nome?: string
          slot_minutos?: number
          staff_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barbeiros_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbeiros_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      barber_push_subscriptions: {
        Row: {
          auth: string
          barbearia_id: string
          created_at: string
          endpoint: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          barbearia_id: string
          created_at?: string
          endpoint: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          barbearia_id?: string
          created_at?: string
          endpoint?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barber_push_subscriptions_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
        ]
      }
      barbershops: {
        Row: {
          allow_client_public_booking: boolean
          allow_client_self_service: boolean
          appointment_deposit_type:
            | Database["public"]["Enums"]["appointment_deposit_type"]
            | null
          appointment_deposit_value: number | null
          appointment_payment_mode: Database["public"]["Enums"]["appointment_payment_mode"]
          avatar_url: string | null
          contact_phone: string | null
          created_at: string
          current_period_end: string | null
          display_name: string
          face_verification_pending: boolean
          grace_until: string | null
          id: string
          infobip_api_key_encrypted: string | null
          infobip_sender_number: string | null
          is_admin_aggregated: boolean
          last_payment_method: string | null
          mp_access_token: string | null
          mp_connect_status: Database["public"]["Enums"]["mp_connect_status"]
          mp_live_mode: boolean | null
          mp_refresh_token: string | null
          mp_subscription_id: string | null
          mp_token_expires_at: string | null
          mp_user_id: number | null
          n8n_webhook_url: string | null
          owner_id: string | null
          payment_enable_card: boolean
          payment_enable_pix: boolean
          payment_max_installments: number | null
          payment_pass_fee_card: boolean
          payment_pass_fee_pix: boolean
          payments_centralized: boolean
          sender_phone_e164: string | null
          sender_sid: string | null
          sheet_url: string | null
          show_service_prices: boolean
          slot_interval_minutes: number
          slug: string
          status_text: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_notice: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          subscription_tier: string | null
          trial_started_at: string
          twilio_subaccount_auth_token: string | null
          twilio_subaccount_sid: string | null
          updated_at: string
          waba_access_token_encrypted: string | null
          waba_business_id: string | null
          waba_coex_contacts_sync_request_id: string | null
          waba_coex_history_sync_request_id: string | null
          waba_connect_status: Database["public"]["Enums"]["waba_connect_status"]
          waba_connected_at: string | null
          waba_flow_type: string | null
          waba_id: string | null
          waba_phone_number_id: string | null
          waba_register_pin: string | null
          welcome_message: string
          welcome_support_pending: boolean
          whatsapp_messaging_provider:
            | Database["public"]["Enums"]["whatsapp_messaging_provider"]
            | null
          whatsapp_number: string | null
        }
        Insert: {
          allow_client_public_booking?: boolean
          allow_client_self_service?: boolean
          appointment_deposit_type?:
            | Database["public"]["Enums"]["appointment_deposit_type"]
            | null
          appointment_deposit_value?: number | null
          appointment_payment_mode?: Database["public"]["Enums"]["appointment_payment_mode"]
          avatar_url?: string | null
          contact_phone?: string | null
          created_at?: string
          current_period_end?: string | null
          display_name?: string
          face_verification_pending?: boolean
          grace_until?: string | null
          id?: string
          infobip_api_key_encrypted?: string | null
          infobip_sender_number?: string | null
          is_admin_aggregated?: boolean
          last_payment_method?: string | null
          mp_access_token?: string | null
          mp_connect_status?: Database["public"]["Enums"]["mp_connect_status"]
          mp_live_mode?: boolean | null
          mp_refresh_token?: string | null
          mp_subscription_id?: string | null
          mp_token_expires_at?: string | null
          mp_user_id?: number | null
          n8n_webhook_url?: string | null
          owner_id?: string | null
          payment_enable_card?: boolean
          payment_enable_pix?: boolean
          payment_max_installments?: number | null
          payment_pass_fee_card?: boolean
          payment_pass_fee_pix?: boolean
          payments_centralized?: boolean
          sender_phone_e164?: string | null
          sender_sid?: string | null
          sheet_url?: string | null
          show_service_prices?: boolean
          slot_interval_minutes?: number
          slug: string
          status_text?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_notice?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: string | null
          trial_started_at?: string
          twilio_subaccount_auth_token?: string | null
          twilio_subaccount_sid?: string | null
          updated_at?: string
          waba_access_token_encrypted?: string | null
          waba_business_id?: string | null
          waba_coex_contacts_sync_request_id?: string | null
          waba_coex_history_sync_request_id?: string | null
          waba_connect_status?: Database["public"]["Enums"]["waba_connect_status"]
          waba_connected_at?: string | null
          waba_flow_type?: string | null
          waba_id?: string | null
          waba_phone_number_id?: string | null
          waba_register_pin?: string | null
          welcome_message?: string
          welcome_support_pending?: boolean
          whatsapp_messaging_provider?:
            | Database["public"]["Enums"]["whatsapp_messaging_provider"]
            | null
          whatsapp_number?: string | null
        }
        Update: {
          allow_client_public_booking?: boolean
          allow_client_self_service?: boolean
          appointment_deposit_type?:
            | Database["public"]["Enums"]["appointment_deposit_type"]
            | null
          appointment_deposit_value?: number | null
          appointment_payment_mode?: Database["public"]["Enums"]["appointment_payment_mode"]
          avatar_url?: string | null
          contact_phone?: string | null
          created_at?: string
          current_period_end?: string | null
          display_name?: string
          face_verification_pending?: boolean
          grace_until?: string | null
          id?: string
          infobip_api_key_encrypted?: string | null
          infobip_sender_number?: string | null
          is_admin_aggregated?: boolean
          last_payment_method?: string | null
          mp_access_token?: string | null
          mp_connect_status?: Database["public"]["Enums"]["mp_connect_status"]
          mp_live_mode?: boolean | null
          mp_refresh_token?: string | null
          mp_subscription_id?: string | null
          mp_token_expires_at?: string | null
          mp_user_id?: number | null
          n8n_webhook_url?: string | null
          owner_id?: string | null
          payment_enable_card?: boolean
          payment_enable_pix?: boolean
          payment_max_installments?: number | null
          payment_pass_fee_card?: boolean
          payment_pass_fee_pix?: boolean
          payments_centralized?: boolean
          sender_phone_e164?: string | null
          sender_sid?: string | null
          sheet_url?: string | null
          show_service_prices?: boolean
          slot_interval_minutes?: number
          slug?: string
          status_text?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_notice?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: string | null
          trial_started_at?: string
          twilio_subaccount_auth_token?: string | null
          twilio_subaccount_sid?: string | null
          updated_at?: string
          waba_access_token_encrypted?: string | null
          waba_business_id?: string | null
          waba_coex_contacts_sync_request_id?: string | null
          waba_coex_history_sync_request_id?: string | null
          waba_connect_status?: Database["public"]["Enums"]["waba_connect_status"]
          waba_connected_at?: string | null
          waba_flow_type?: string | null
          waba_id?: string | null
          waba_phone_number_id?: string | null
          waba_register_pin?: string | null
          welcome_message?: string
          welcome_support_pending?: boolean
          whatsapp_messaging_provider?:
            | Database["public"]["Enums"]["whatsapp_messaging_provider"]
            | null
          whatsapp_number?: string | null
        }
        Relationships: []
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
          observacao: string | null
        }
        Insert: {
          barbeiro_id: string
          created_at?: string
          data: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          motivo?: string | null
          observacao?: string | null
        }
        Update: {
          barbeiro_id?: string
          created_at?: string
          data?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          motivo?: string | null
          observacao?: string | null
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
      cliente_dedupe_merge_map: {
        Row: {
          agendamentos_remapped: number
          id: string
          merge_batch_id: string
          merged_at: string
          new_cliente_id: string
          old_cliente_id: string
          old_row_snapshot: Json
          survivor_rank: number
          titular_user_id: string
          whatsapp_digits: string
        }
        Insert: {
          agendamentos_remapped?: number
          id?: string
          merge_batch_id: string
          merged_at?: string
          new_cliente_id: string
          old_cliente_id: string
          old_row_snapshot: Json
          survivor_rank: number
          titular_user_id: string
          whatsapp_digits: string
        }
        Update: {
          agendamentos_remapped?: number
          id?: string
          merge_batch_id?: string
          merged_at?: string
          new_cliente_id?: string
          old_cliente_id?: string
          old_row_snapshot?: Json
          survivor_rank?: number
          titular_user_id?: string
          whatsapp_digits?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          auth_user_id: string | null
          avatar_url: string | null
          barbearia_id: string | null
          created_at: string
          data_nascimento: string | null
          id: string
          last_clinical_activity_at: string | null
          nome: string
          retention_until: string | null
          titular_user_id: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          barbearia_id?: string | null
          created_at?: string
          data_nascimento?: string | null
          id?: string
          last_clinical_activity_at?: string | null
          nome: string
          retention_until?: string | null
          titular_user_id: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          barbearia_id?: string | null
          created_at?: string
          data_nascimento?: string | null
          id?: string
          last_clinical_activity_at?: string | null
          nome?: string
          retention_until?: string | null
          titular_user_id?: string
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
      clinical_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          changed_fields: Json | null
          created_at: string
          id: string
          record_id: string
          table_name: string
          titular_user_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          changed_fields?: Json | null
          created_at?: string
          id?: string
          record_id: string
          table_name: string
          titular_user_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          changed_fields?: Json | null
          created_at?: string
          id?: string
          record_id?: string
          table_name?: string
          titular_user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          barbershop_id: string
          created_at: string
          customer_name: string | null
          customer_phone: string
          id: string
          last_message_at: string
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          customer_name?: string | null
          customer_phone: string
          id?: string
          last_message_at?: string
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string
          id?: string
          last_message_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
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
      extension_connect_message_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          label: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      extension_connect_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      facial_embeddings: {
        Row: {
          created_at: string
          embedding: number[]
          id: string
          model_version: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          embedding: number[]
          id?: string
          model_version?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          embedding?: number[]
          id?: string
          model_version?: string
          user_id?: string | null
        }
        Relationships: []
      }
      facial_handoff_sessions: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          fail_reason: string | null
          id: string
          result: Json | null
          status: string
          watch_token: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          fail_reason?: string | null
          id?: string
          result?: Json | null
          status?: string
          watch_token: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          fail_reason?: string | null
          id?: string
          result?: Json | null
          status?: string
          watch_token?: string
        }
        Relationships: []
      }
      integracao_condicao_estado: {
        Row: {
          barbearia_id: string | null
          codigo: string
          condicao_ok: boolean
          id: string
          verificado_em: string
        }
        Insert: {
          barbearia_id?: string | null
          codigo: string
          condicao_ok?: boolean
          id?: string
          verificado_em?: string
        }
        Update: {
          barbearia_id?: string | null
          codigo?: string
          condicao_ok?: boolean
          id?: string
          verificado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_condicao_estado_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          barbershop_id: string
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender: Database["public"]["Enums"]["message_sender"]
          status: Database["public"]["Enums"]["message_status"]
        }
        Insert: {
          barbershop_id: string
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender: Database["public"]["Enums"]["message_sender"]
          status?: Database["public"]["Enums"]["message_status"]
        }
        Update: {
          barbershop_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender?: Database["public"]["Enums"]["message_sender"]
          status?: Database["public"]["Enums"]["message_status"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          id: string
          shop_id: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          id?: string
          shop_id: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          id?: string
          shop_id?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_oauth_states_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_payment_exceptions: {
        Row: {
          agendamento_id: string | null
          amount_centavos: number
          barbearia_id: string
          created_at: string
          id: string
          metadata: Json
          mp_payment_id: string
          reason: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          agendamento_id?: string | null
          amount_centavos: number
          barbearia_id: string
          created_at?: string
          id?: string
          metadata?: Json
          mp_payment_id: string
          reason?: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          agendamento_id?: string | null
          amount_centavos?: number
          barbearia_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          mp_payment_id?: string
          reason?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_payment_exceptions_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mp_payment_exceptions_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_webhook_events: {
        Row: {
          created_at: string
          event_key: string
          resource_id: string
          resource_status: string | null
          resource_type: string
        }
        Insert: {
          created_at?: string
          event_key: string
          resource_id: string
          resource_status?: string | null
          resource_type: string
        }
        Update: {
          created_at?: string
          event_key?: string
          resource_id?: string
          resource_status?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      paciente_documentos: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          barbearia_id: string | null
          created_at: string
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          titular_user_id: string
          uploaded_by: string | null
          whatsapp_digits: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          barbearia_id?: string | null
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
          titular_user_id: string
          uploaded_by?: string | null
          whatsapp_digits: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          barbearia_id?: string | null
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          titular_user_id?: string
          uploaded_by?: string | null
          whatsapp_digits?: string
        }
        Relationships: [
          {
            foreignKeyName: "paciente_documentos_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
        ]
      }
      paciente_painel_removidos: {
        Row: {
          removed_at: string
          removed_by: string
          titular_user_id: string
          whatsapp_digits: string
        }
        Insert: {
          removed_at?: string
          removed_by: string
          titular_user_id: string
          whatsapp_digits: string
        }
        Update: {
          removed_at?: string
          removed_by?: string
          titular_user_id?: string
          whatsapp_digits?: string
        }
        Relationships: []
      }
      patient_activation_tokens: {
        Row: {
          barbearia_id: string
          cliente_id: string
          created_at: string
          expires_at: string
          id: string
          nome: string
          token: string
          used_at: string | null
          whatsapp: string
        }
        Insert: {
          barbearia_id: string
          cliente_id: string
          created_at?: string
          expires_at?: string
          id?: string
          nome: string
          token: string
          used_at?: string | null
          whatsapp: string
        }
        Update: {
          barbearia_id?: string
          cliente_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          nome?: string
          token?: string
          used_at?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_activation_tokens_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_activation_tokens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: number
          n8n_webhook_url: string | null
          support_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          n8n_webhook_url?: string | null
          support_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          n8n_webhook_url?: string | null
          support_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          barbershop_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          staff_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          staff_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          staff_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_schedules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          name: string
          price_cents: number
          sort_order: number
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          id?: string
          name: string
          price_cents?: number
          sort_order?: number
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          price_cents?: number
          sort_order?: number
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_claims: {
        Row: {
          claimed_at: string
          email: string
          user_id: string | null
        }
        Insert: {
          claimed_at?: string
          email: string
          user_id?: string | null
        }
        Update: {
          claimed_at?: string
          email?: string
          user_id?: string | null
        }
        Relationships: []
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
      waba_connect_attempts: {
        Row: {
          code_received_at: string | null
          completed_at: string | null
          completed_via: string | null
          discovered_business_id: string | null
          discovered_flow_type: string | null
          discovered_meta_user_id: string | null
          discovered_phone_number_id: string | null
          discovered_waba_id: string | null
          error_message: string | null
          expires_at: string
          id: string
          known_waba_ids_snapshot: Json
          owner_id: string
          shop_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          code_received_at?: string | null
          completed_at?: string | null
          completed_via?: string | null
          discovered_business_id?: string | null
          discovered_flow_type?: string | null
          discovered_meta_user_id?: string | null
          discovered_phone_number_id?: string | null
          discovered_waba_id?: string | null
          error_message?: string | null
          expires_at?: string
          id?: string
          known_waba_ids_snapshot?: Json
          owner_id: string
          shop_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          code_received_at?: string | null
          completed_at?: string | null
          completed_via?: string | null
          discovered_business_id?: string | null
          discovered_flow_type?: string | null
          discovered_meta_user_id?: string | null
          discovered_phone_number_id?: string | null
          discovered_waba_id?: string | null
          error_message?: string | null
          expires_at?: string
          id?: string
          known_waba_ids_snapshot?: Json
          owner_id?: string
          shop_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waba_connect_attempts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens_enviadas: {
        Row: {
          agendamento_id: string
          barbearia_id: string
          enviado_em: string
          external_message_id: string | null
          id: string
          provider: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          respondido_em: string | null
          status: string
          telefone: string
          tipo: string
        }
        Insert: {
          agendamento_id: string
          barbearia_id: string
          enviado_em?: string
          external_message_id?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          respondido_em?: string | null
          status?: string
          telefone: string
          tipo?: string
        }
        Update: {
          agendamento_id?: string
          barbearia_id?: string
          enviado_em?: string
          external_message_id?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          respondido_em?: string | null
          status?: string
          telefone?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_enviadas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_enviadas_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_usage_log: {
        Row: {
          agendamento_id: string | null
          barbearia_id: string
          criado_em: string
          external_message_id: string | null
          id: string
          profissional_id: string | null
          provider: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          tipo: string
        }
        Insert: {
          agendamento_id?: string | null
          barbearia_id: string
          criado_em?: string
          external_message_id?: string | null
          id?: string
          profissional_id?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          tipo: string
        }
        Update: {
          agendamento_id?: string | null
          barbearia_id?: string
          criado_em?: string
          external_message_id?: string | null
          id?: string
          profissional_id?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_usage_log_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_usage_log_barbearia_id_fkey"
            columns: ["barbearia_id"]
            isOneToOne: false
            referencedRelation: "barbearias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_usage_log_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "barbeiros"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_jobs: {
        Row: {
          attempts: number
          body: string
          button_payload: string | null
          created_at: string
          id: string
          inbound_message_id: string
          last_error: string | null
          max_attempts: number
          processed_at: string | null
          provider: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          started_at: string | null
          status: string
          telefone: string
        }
        Insert: {
          attempts?: number
          body: string
          button_payload?: string | null
          created_at?: string
          id?: string
          inbound_message_id: string
          last_error?: string | null
          max_attempts?: number
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          started_at?: string | null
          status?: string
          telefone: string
        }
        Update: {
          attempts?: number
          body?: string
          button_payload?: string | null
          created_at?: string
          id?: string
          inbound_message_id?: string
          last_error?: string | null
          max_attempts?: number
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          started_at?: string | null
          status?: string
          telefone?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandon_public_booking_payment_checkout: {
        Args: { p_agendamento_id: string; p_confirmation_token: string }
        Returns: Json
      }
      account_deletion_blocked_by_active_cas: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      admin_alertas_integracao_count: { Args: never; Returns: number }
      admin_get_support_whatsapp: { Args: never; Returns: string }
      admin_get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      admin_list_admin_aggregated_accounts: { Args: never; Returns: Json }
      admin_list_alertas_integracao: {
        Args: { p_limit?: number }
        Returns: Json
      }
      admin_list_failed_whatsapp_webhook_jobs: {
        Args: { p_limit?: number }
        Returns: Json
      }
      admin_lookup_user_by_email: { Args: { p_email: string }; Returns: Json }
      admin_month_metrics: { Args: { p_month: string }; Returns: Json }
      admin_new_signups_list: {
        Args: { p_end: string; p_start: string }
        Returns: {
          contact_phone: string
          created_at: string
          display_name: string
          email: string
        }[]
      }
      admin_not_subscribed_list: {
        Args: { p_end: string; p_start: string }
        Returns: {
          contact_phone: string
          created_at: string
          display_name: string
        }[]
      }
      admin_panel_metrics: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      admin_purge_facial_data_for_user: {
        Args: { p_max_distance?: number; p_user_id: string }
        Returns: number
      }
      admin_remove_admin_aggregated: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_set_admin_aggregated: { Args: { p_email: string }; Returns: Json }
      admin_set_support_whatsapp: {
        Args: { p_whatsapp: string }
        Returns: Json
      }
      admin_subscription_stats: { Args: never; Returns: Json }
      admin_whatsapp_webhook_jobs_failed_count_24h: {
        Args: never
        Returns: number
      }
      agendamento_cancelado_por: {
        Args: { p_cancelado_por: string; p_origem: string }
        Returns: string
      }
      agendamento_conta_no_relatorio: {
        Args: { p_agendamento_id: string }
        Returns: boolean
      }
      agendamento_dentro_retencao: { Args: { _data: string }; Returns: boolean }
      alterar_agendamento_painel: {
        Args: { p_acao: string; p_agendamento_id: string }
        Returns: Json
      }
      alterar_status_agendamento_passado_painel: {
        Args: { p_agendamento_id: string; p_status: string }
        Returns: Json
      }
      apply_mp_pass_fee_centavos: {
        Args: {
          p_charge_centavos: number
          p_installments?: number
          p_method: string
          p_pass_fee_card?: boolean
          p_pass_fee_pix?: boolean
        }
        Returns: number
      }
      barbearia_allows_public_booking_insert: {
        Args: { p_barbearia_id: string }
        Returns: boolean
      }
      barbearia_dentro_do_limite: {
        Args: { _barbearia_id: string }
        Returns: boolean
      }
      barbearia_pode_agendar: {
        Args: { _barbearia_id: string }
        Returns: boolean
      }
      barbershop_created_date_sp: {
        Args: { s: Database["public"]["Tables"]["barbershops"]["Row"] }
        Returns: string
      }
      barbershop_ever_paid: {
        Args: { s: Database["public"]["Tables"]["barbershops"]["Row"] }
        Returns: boolean
      }
      barbershop_is_active_subscriber: {
        Args: { s: Database["public"]["Tables"]["barbershops"]["Row"] }
        Returns: boolean
      }
      barbershop_signup_completed: {
        Args: { s: Database["public"]["Tables"]["barbershops"]["Row"] }
        Returns: boolean
      }
      barbershop_signup_completed_date_sp: {
        Args: { s: Database["public"]["Tables"]["barbershops"]["Row"] }
        Returns: string
      }
      barbershop_subscription_allows_booking: {
        Args: { _owner_id: string }
        Returns: boolean
      }
      barbershop_trial_started_date_sp: {
        Args: { s: Database["public"]["Tables"]["barbershops"]["Row"] }
        Returns: string
      }
      bloqueio_conflita_agendamentos: {
        Args: {
          p_barbeiro_id: string
          p_data: string
          p_hora_fim: string
          p_hora_inicio: string
        }
        Returns: boolean
      }
      calculate_appointment_payment_centavos: {
        Args: {
          p_barbeiro_id: string
          p_deposit_type: Database["public"]["Enums"]["appointment_deposit_type"]
          p_deposit_value: number
          p_mode: Database["public"]["Enums"]["appointment_payment_mode"]
          p_servicos_nomes: string[]
        }
        Returns: Json
      }
      cancel_public_booking_payment_hold: {
        Args: { p_agendamento_id: string; p_confirmation_token: string }
        Returns: Json
      }
      cancel_unconfirmed_appointments: { Args: never; Returns: number }
      cancelar_agendamento_cliente: {
        Args: { _agendamento_id: string; _slug: string; _whatsapp: string }
        Returns: undefined
      }
      check_barbearia_pode_agendar: {
        Args: { p_barbearia_id: string }
        Returns: boolean
      }
      check_facial_trial_eligibility: {
        Args: { p_embedding: number[] }
        Returns: Json
      }
      claim_facial_handoff_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      client_hub_barbearia_ids_for_slug: {
        Args: { p_slug: string }
        Returns: string[]
      }
      cliente_dedupe_dry_run: {
        Args: { p_sample_limit?: number }
        Returns: Json
      }
      cliente_dedupe_execute: { Args: { p_dry_run?: boolean }; Returns: Json }
      cliente_dedupe_nome_similar: {
        Args: { p_nome_a: string; p_nome_b: string }
        Returns: boolean
      }
      cliente_nome_exibicao: {
        Args: {
          p_barbearia_id: string
          p_cliente_id: string
          p_cliente_whatsapp: string
          p_fallback: string
        }
        Returns: string
      }
      cliente_pode_gerenciar_agendamento: {
        Args: { _data: string }
        Returns: boolean
      }
      cliente_whatsapp_digits: { Args: { p_whatsapp: string }; Returns: string }
      clinical_archive_for_account_deletion: {
        Args: {
          p_actor_user_id?: string
          p_reason?: string
          p_titular_user_id: string
        }
        Returns: Json
      }
      clinical_titular_user_id_for_barbearia: {
        Args: { p_barbearia_id: string }
        Returns: string
      }
      close_aggregated_links_on_account_deletion: {
        Args: { p_user_id: string }
        Returns: Json
      }
      complete_facial_handoff_session: {
        Args: { p_embedding: number[]; p_session_id: string }
        Returns: Json
      }
      compute_cliente_last_clinical_activity_at: {
        Args: { p_cliente_id: string }
        Returns: string
      }
      concluir_agendamentos_confirmados_dia_anterior: {
        Args: never
        Returns: number
      }
      concluir_ativacao_paciente: {
        Args: { p_auth_user_id: string; p_token: string }
        Returns: Json
      }
      confirm_appointment_payment: {
        Args: { p_agendamento_id: string; p_mp_payment_id: string }
        Returns: Json
      }
      confirmar_presenca_agendamento_painel: {
        Args: { p_agendamento_id: string }
        Returns: string
      }
      consume_facial_handoff_result: {
        Args: { p_session_id: string; p_watch_token: string }
        Returns: Json
      }
      consume_mp_oauth_state: { Args: { p_state: string }; Returns: Json }
      create_extension_connect_token: {
        Args: { p_label?: string }
        Returns: Json
      }
      create_facial_handoff_session: { Args: never; Returns: Json }
      create_mp_oauth_state: {
        Args: { p_code_verifier: string; p_shop_id: string; p_state: string }
        Returns: string
      }
      create_paciente_cadastro_painel: {
        Args: { p_data_nascimento?: string; p_nome: string; p_whatsapp: string }
        Returns: Json
      }
      create_patient_activation_token: {
        Args: { p_cliente_id: string }
        Returns: Json
      }
      create_public_booking_payment_hold: {
        Args: {
          p_barbearia_id: string
          p_barbeiro_id: string
          p_cliente_id: string
          p_cliente_nome: string
          p_cliente_whatsapp: string
          p_data: string
          p_duracao_minutos: number
          p_hora: string
          p_observacao?: string
          p_servicos_nomes: string[]
        }
        Returns: Json
      }
      ct_list_ca_info: {
        Args: never
        Returns: {
          barbearia_id: string
          shop_display_name: string
          slug: string
        }[]
      }
      delete_appointment_payment_hold: {
        Args: { p_agendamento_id: string }
        Returns: Json
      }
      delete_paciente_cadastro_painel: {
        Args: { p_whatsapp_digits: string }
        Returns: Json
      }
      delete_paciente_documento_painel: {
        Args: { p_documento_id: string }
        Returns: Json
      }
      delete_public_booking_payment_hold: {
        Args: { p_agendamento_id: string; p_confirmation_token: string }
        Returns: Json
      }
      disconnect_mp_account: { Args: never; Returns: Json }
      dispensar_alerta_integracao: {
        Args: { p_alerta_id: string }
        Returns: Json
      }
      effective_slot_interval_minutes_for_shop: {
        Args: { p_shop_id: string }
        Returns: number
      }
      encerrar_bloqueio_painel: {
        Args: { p_bloqueio_id: string }
        Returns: undefined
      }
      encerrar_bloqueios_ferias_painel: {
        Args: { p_barbeiro_ids: string[] }
        Returns: undefined
      }
      ensure_agenda_from_barbershop_slug: {
        Args: { p_slug: string }
        Returns: string
      }
      excluir_agendamento_painel: {
        Args: { p_agendamento_id: string }
        Returns: Json
      }
      expirar_agendamentos_aguardando_pagamento: {
        Args: never
        Returns: number
      }
      expirar_agendamentos_nao_confirmados: {
        Args: { p_barbearia_ids?: string[] }
        Returns: number
      }
      expirar_agendamentos_nao_confirmados_painel: {
        Args: never
        Returns: number
      }
      extension_connect_client_lookup:
        | { Args: { p_phone: string; p_user_id: string }; Returns: Json }
        | {
            Args: {
              p_display_name?: string
              p_phone: string
              p_user_id: string
            }
            Returns: Json
          }
      extension_connect_clinic_display_name: {
        Args: { p_user_id: string }
        Returns: string
      }
      extension_connect_delete_message_template: {
        Args: { p_id: string; p_user_id: string }
        Returns: Json
      }
      extension_connect_list_message_templates: {
        Args: { p_user_id: string }
        Returns: Json
      }
      extension_connect_pode_ler_conteudo_anotacao: {
        Args: { p_agendamento_id: string; p_user_id: string }
        Returns: boolean
      }
      extension_connect_upsert_message_template: {
        Args: {
          p_body: string
          p_id: string
          p_label: string
          p_user_id: string
        }
        Returns: Json
      }
      extension_connect_whatsapp_matches: {
        Args: { p_a: string; p_b: string }
        Returns: boolean
      }
      face_descriptor_distance: {
        Args: { a: number[]; b: number[] }
        Returns: number
      }
      face_has_existing_match: {
        Args: {
          p_embedding: number[]
          p_exclude_user_id?: string
          p_max_distance?: number
        }
        Returns: boolean
      }
      fail_appointment_payment: {
        Args: { p_agendamento_id: string; p_mp_payment_id?: string }
        Returns: Json
      }
      generate_unique_slug: { Args: { base: string }; Returns: string }
      get_agendamento_anotacao: {
        Args: { p_agendamento_id: string }
        Returns: Json
      }
      get_agendamentos_painel: {
        Args: { p_data_fim: string; p_data_inicio: string }
        Returns: Json
      }
      get_appointment_confirmation_og: {
        Args: { p_token: string }
        Returns: Json
      }
      get_billing_owner_for_shop: {
        Args: { _owner_id: string }
        Returns: string
      }
      get_bloqueios_painel: {
        Args: { p_barbershop_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_booking_professionals: {
        Args: {
          p_editable_cas_only?: boolean
          p_from?: string
          p_hub_only?: boolean
          p_painel_visiveis?: boolean
          p_slug: string
          p_to?: string
        }
        Returns: Json
      }
      get_client_confirmation_push_status: {
        Args: { _slug: string; _whatsapp: string }
        Returns: {
          confirmation_token: string
          needs_resubscribe: boolean
        }[]
      }
      get_client_self_service_flags_for_barbearia: {
        Args: { p_barbearia_id: string }
        Returns: {
          allow_public_booking: boolean
          allow_self_service: boolean
        }[]
      }
      get_cliente_cadastro_por_whatsapp: {
        Args: { p_barbearia_id: string; p_whatsapp: string }
        Returns: Json
      }
      get_effective_appointment_payment_settings: {
        Args: { p_barbearia_id: string }
        Returns: Json
      }
      get_email_signup_status: {
        Args: { check_email: string }
        Returns: string
      }
      get_my_subscription: { Args: never; Returns: Json }
      get_or_create_patient_activation_link: {
        Args: { p_whatsapp_digits: string }
        Returns: Json
      }
      get_payment_panel_settings: { Args: never; Returns: Json }
      get_relatorio_agendamentos: {
        Args: { p_data_fim: string; p_data_inicio: string }
        Returns: Json
      }
      get_relatorio_detalhes_colaborador: {
        Args: {
          p_barbeiro_id: string
          p_data_fim: string
          p_data_inicio: string
        }
        Returns: Json
      }
      get_support_whatsapp: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      inherit_appointment_push_subscription: {
        Args: { _agendamento_id: string; _force_refresh?: boolean }
        Returns: boolean
      }
      invite_aggregated_account: { Args: { p_email: string }; Returns: Json }
      invoke_poll_waba_connect_attempts_cron: { Args: never; Returns: number }
      invoke_process_appointment_reminder_3h_cron: {
        Args: never
        Returns: number
      }
      invoke_process_appointment_reminders_cron: {
        Args: never
        Returns: number
      }
      invoke_process_whatsapp_webhook_jobs_cron: {
        Args: never
        Returns: number
      }
      is_booking_professional_for_slug: {
        Args: {
          p_barbeiro_id: string
          p_from?: string
          p_slug: string
          p_to?: string
        }
        Returns: boolean
      }
      is_email_registered: { Args: { check_email: string }; Returns: boolean }
      jsonb_to_real_array: { Args: { j: Json }; Returns: number[] }
      leave_my_aggregated_account: { Args: never; Returns: Json }
      list_agendamento_alerts: {
        Args: { p_agendamento_id: string }
        Returns: Json
      }
      list_alertas_integracao_profissional: {
        Args: { p_barbearia_id: string }
        Returns: Json
      }
      list_extension_connect_tokens: { Args: never; Returns: Json }
      list_mp_payment_exceptions: { Args: { p_limit?: number }; Returns: Json }
      list_my_aggregated_accounts: { Args: never; Returns: Json }
      list_paciente_anotacoes: {
        Args: { p_barbeiro_id?: string; p_whatsapp_digits: string }
        Returns: Json
      }
      list_paciente_documentos: {
        Args: { p_whatsapp_digits: string }
        Returns: Json
      }
      list_pacientes_painel: {
        Args: {
          p_barbeiro_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: Json
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
          observacao: string
          servicos_nomes: string[]
          status: Database["public"]["Enums"]["agendamento_status"]
        }[]
      }
      log_clinical_audit: {
        Args: {
          p_action: string
          p_changed_fields?: Json
          p_record_id: string
          p_table_name: string
          p_titular_user_id: string
        }
        Returns: undefined
      }
      mp_credentials_shop_id: {
        Args: { p_barbearia_id: string }
        Returns: string
      }
      paciente_documento_mime_permitido: {
        Args: { p_mime: string }
        Returns: boolean
      }
      paciente_painel_esta_removido: {
        Args: { p_titular_user_id: string; p_whatsapp_digits: string }
        Returns: boolean
      }
      painel_agendamento_e_de_ca_agregada: {
        Args: { p_agendamento_id: string }
        Returns: boolean
      }
      painel_agendamento_visivel_pacientes: {
        Args: {
          p_agendamento_barbearia_id: string
          p_barbearia_ids: string[]
          p_barbeiro_id: string
        }
        Returns: boolean
      }
      painel_barbearia_ids_agendamentos_editaveis: {
        Args: never
        Returns: string[]
      }
      painel_barbearia_ids_agendamentos_editaveis_for_user: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      painel_barbearia_ids_editaveis: { Args: never; Returns: string[] }
      painel_barbearia_ids_familia_conta: { Args: never; Returns: string[] }
      painel_barbearia_ids_familia_conta_for_user: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      painel_barbearia_ids_pacientes_visiveis: {
        Args: never
        Returns: string[]
      }
      painel_barbearia_ids_pacientes_visiveis_for_user: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      painel_barbearia_ids_visiveis: { Args: never; Returns: string[] }
      painel_barbearia_ids_visiveis_for_user: {
        Args: { p_user_id: string }
        Returns: string[]
      }
      painel_paciente_documentos_visivel: {
        Args: { p_whatsapp_digits: string }
        Returns: boolean
      }
      painel_paciente_escopo_documentos: {
        Args: { p_whatsapp_digits: string }
        Returns: boolean
      }
      painel_pode_escrever_anotacao: {
        Args: { p_agendamento_id: string }
        Returns: boolean
      }
      painel_pode_gerenciar_agendamento: {
        Args: { p_barbearia_id: string }
        Returns: boolean
      }
      painel_pode_gerenciar_barbeiro: {
        Args: { p_barbeiro_id: string }
        Returns: boolean
      }
      painel_pode_ler_anotacao: {
        Args: { p_agendamento_id: string }
        Returns: boolean
      }
      painel_pode_ler_conteudo_anotacao: {
        Args: { p_agendamento_id: string }
        Returns: boolean
      }
      painel_pode_upload_documento_paciente: {
        Args: { p_whatsapp_digits: string }
        Returns: boolean
      }
      painel_pode_ver_barbershop: {
        Args: { p_barbershop_id: string }
        Returns: boolean
      }
      painel_titular_pode_ver_conteudo_anotacao_ca: {
        Args: { p_agendamento_id: string }
        Returns: boolean
      }
      painel_titular_user_id: { Args: never; Returns: string }
      painel_titular_user_id_for_user: {
        Args: { p_user_id: string }
        Returns: string
      }
      payment_destination_shop_id: {
        Args: { p_barbearia_id: string }
        Returns: string
      }
      promote_appointment_payment_if_slot_available: {
        Args: { p_agendamento_id: string; p_mp_payment_id: string }
        Returns: Json
      }
      provision_professional_account: {
        Args: { p_display_name?: string; p_shop_name: string }
        Returns: Json
      }
      public_booking_hold_blocks_slot: {
        Args: {
          p_agendamento: Database["public"]["Tables"]["agendamentos"]["Row"]
        }
        Returns: boolean
      }
      purge_ca_staff_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      reagendar_agendamento:
        | {
            Args: {
              p_agendamento_id: string
              p_barbeiro_id: string
              p_data: string
              p_duracao_minutos: number
              p_hora: string
              p_observacao?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_agendamento_id: string
              p_barbeiro_id: string
              p_data: string
              p_duracao_minutos: number
              p_hora: string
              p_observacao?: string
              p_servicos_nomes?: string[]
            }
            Returns: undefined
          }
      reagendar_agendamento_cliente: {
        Args: {
          p_agendamento_id: string
          p_barbeiro_id: string
          p_data: string
          p_duracao_minutos: number
          p_hora: string
          p_observacao?: string
          p_servicos_nomes?: string[]
          p_slug: string
          p_whatsapp: string
        }
        Returns: Json
      }
      refresh_cliente_last_clinical_activity: {
        Args: { p_cliente_id: string }
        Returns: undefined
      }
      register_late_payment_slot_conflict: {
        Args: {
          p_mp_payment_id: string
          p_row: Database["public"]["Tables"]["agendamentos"]["Row"]
        }
        Returns: Json
      }
      register_paciente_documento_painel: {
        Args: {
          p_file_name: string
          p_mime_type: string
          p_size_bytes: number
          p_storage_path: string
          p_whatsapp_digits: string
        }
        Returns: Json
      }
      register_user_facial_embedding: {
        Args: { p_embedding: number[] }
        Returns: Json
      }
      registrar_erro_integracao: {
        Args: {
          p_barbearia_id: string
          p_codigo: string
          p_integracao: string
          p_mensagem: string
          p_mensagem_acao?: string
          p_severidade?: string
          p_titulo: string
        }
        Returns: string
      }
      registrar_ok_integracao: {
        Args: { p_barbearia_id: string; p_codigo: string }
        Returns: undefined
      }
      registrar_uso_mensageria: {
        Args: {
          p_agendamento_id?: string
          p_barbearia_id: string
          p_external_message_id?: string
          p_profissional_id?: string
          p_provider?: Database["public"]["Enums"]["whatsapp_messaging_provider"]
          p_tipo: string
        }
        Returns: string
      }
      remove_aggregated_account: {
        Args: { p_account_id: string }
        Returns: Json
      }
      resolve_agendamento_alert: { Args: { p_alert_id: string }; Returns: Json }
      resolve_appointment_charge_centavos: {
        Args: {
          p_agendamento_id: string
          p_installments?: number
          p_method: string
          p_pass_fee_card?: boolean
          p_pass_fee_pix?: boolean
        }
        Returns: number
      }
      resolve_mp_payment_exception: {
        Args: { p_exception_id: string }
        Returns: Json
      }
      revoke_extension_connect_token: {
        Args: { p_token_id: string }
        Returns: Json
      }
      salvar_bloqueios_dia_painel: {
        Args: {
          p_barbeiro_id: string
          p_data: string
          p_horarios?: string[]
          p_modo: string
          p_observacao?: string
        }
        Returns: undefined
      }
      salvar_bloqueios_ferias_painel: {
        Args: {
          p_barbeiro_ids: string[]
          p_data_fim: string
          p_data_inicio: string
        }
        Returns: undefined
      }
      save_mp_oauth_tokens: {
        Args: {
          p_access_token: string
          p_expires_in: number
          p_live_mode: boolean
          p_mp_user_id: number
          p_refresh_token: string
          p_shop_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      search_clientes_cadastro_painel: {
        Args: { p_barbearia_id: string; p_limit?: number; p_search?: string }
        Returns: Json
      }
      set_allow_client_public_booking: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      set_allow_client_self_service: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      set_show_service_prices: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      shop_can_use_appointment_payments: {
        Args: { p_shop: Database["public"]["Tables"]["barbershops"]["Row"] }
        Returns: boolean
      }
      shop_has_priced_active_services: {
        Args: { p_shop_id: string }
        Returns: boolean
      }
      shop_id_for_barbearia: {
        Args: { p_barbearia_id: string }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slot_is_taken_for_appointment: {
        Args: {
          p_barbeiro_id: string
          p_data: string
          p_exclude_id?: string
          p_hora: string
        }
        Returns: boolean
      }
      submit_facial_handoff_verification: {
        Args: { p_embedding: number[]; p_session_id: string }
        Returns: Json
      }
      titular_shop_id_for_shop: { Args: { p_shop_id: string }; Returns: string }
      update_ca_titular_appointment_permissions: {
        Args: {
          p_owner_can_edit_appointments: boolean
          p_owner_can_view_annotations: boolean
          p_owner_can_view_appointments: boolean
        }
        Returns: Json
      }
      update_paciente_avatar_painel: {
        Args: { p_avatar_url: string; p_whatsapp_digits: string }
        Returns: Json
      }
      update_paciente_data_nascimento_painel: {
        Args: { p_data_nascimento?: string; p_whatsapp_digits: string }
        Returns: Json
      }
      update_paciente_nome_painel: {
        Args: { p_nome: string; p_whatsapp_digits: string }
        Returns: Json
      }
      update_paciente_whatsapp_painel: {
        Args: { p_new_whatsapp: string; p_whatsapp_digits: string }
        Returns: Json
      }
      update_payment_panel_settings: {
        Args: {
          p_appointment_deposit_type?: string
          p_appointment_deposit_value?: number
          p_appointment_payment_mode?: string
          p_payment_enable_card?: boolean
          p_payment_enable_pix?: boolean
          p_payment_max_installments?: number
          p_payment_pass_fee_card?: boolean
          p_payment_pass_fee_pix?: boolean
          p_payments_centralized?: boolean
        }
        Returns: Json
      }
      upsert_agendamento_anotacao: {
        Args: { p_agendamento_id: string; p_conteudo: string }
        Returns: Json
      }
      upsert_cliente_por_whatsapp: {
        Args: { _barbearia_id: string; _nome: string; _whatsapp: string }
        Returns: string
      }
      user_can_manage_barbearia: {
        Args: { p_barbearia_id: string; p_user_id?: string }
        Returns: boolean
      }
      user_needs_face_verification: { Args: never; Returns: boolean }
      user_owns_barbershop: {
        Args: { p_barbershop_id: string }
        Returns: boolean
      }
      user_owns_staff: { Args: { p_staff_id: string }; Returns: boolean }
      validate_extension_connect_token: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      verify_patient_activation_token: {
        Args: { p_token: string }
        Returns: Json
      }
      whatsapp_match_digits: {
        Args: { a: string; b: string }
        Returns: boolean
      }
    }
    Enums: {
      agendamento_status:
        | "confirmado"
        | "cancelado"
        | "concluido"
        | "nao_veio"
        | "aguardando_pagamento"
      aggregated_account_status:
        | "pending"
        | "awaiting_face"
        | "active"
        | "removed"
      app_role: "admin" | "barber"
      appointment_deposit_type: "percent" | "fixed"
      appointment_payment_mode: "none" | "deposit" | "full"
      appointment_payment_status:
        | "pending"
        | "paid"
        | "failed"
        | "cancelled"
        | "pending_resolution"
      message_sender: "customer" | "ai"
      message_status: "sending" | "sent" | "delivered" | "read" | "failed"
      mp_connect_status: "not_connected" | "connected" | "token_expired"
      subscription_status:
        | "trial"
        | "active"
        | "grace"
        | "expired"
        | "cancelled"
      waba_connect_status:
        | "not_connected"
        | "provisioning"
        | "pending"
        | "connected"
        | "error"
        | "token_expired"
      whatsapp_messaging_provider: "twilio" | "infobip" | "meta"
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
    Enums: {
      agendamento_status: [
        "confirmado",
        "cancelado",
        "concluido",
        "nao_veio",
        "aguardando_pagamento",
      ],
      aggregated_account_status: [
        "pending",
        "awaiting_face",
        "active",
        "removed",
      ],
      app_role: ["admin", "barber"],
      appointment_deposit_type: ["percent", "fixed"],
      appointment_payment_mode: ["none", "deposit", "full"],
      appointment_payment_status: [
        "pending",
        "paid",
        "failed",
        "cancelled",
        "pending_resolution",
      ],
      message_sender: ["customer", "ai"],
      message_status: ["sending", "sent", "delivered", "read", "failed"],
      mp_connect_status: ["not_connected", "connected", "token_expired"],
      subscription_status: ["trial", "active", "grace", "expired", "cancelled"],
      waba_connect_status: [
        "not_connected",
        "provisioning",
        "pending",
        "connected",
        "error",
        "token_expired",
      ],
      whatsapp_messaging_provider: ["twilio", "infobip", "meta"],
    },
  },
} as const
A new version of Supabase CLI is available: v2.117.0 (currently installed v2.101.0)
We recommend updating regularly for new features and bug fixes: 
https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
