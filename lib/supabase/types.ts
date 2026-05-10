export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TranscriptStatus = "pending" | "found" | "missing" | "placeholder" | "failed";
export type JobRunStatus = "started" | "succeeded" | "failed" | "skipped";
export type VideoClassificationStatus = "weekly_report" | "possible_report" | "extra_upload" | "ignored";
export type ClassificationStatus = "pending" | "classified" | "failed";
export type ClassificationConfidence = "high" | "medium" | "low";
export type RecommendedAction = "auto_summarize" | "ask_user" | "ignore";
export type UserApprovalStatus = "none" | "summary_available_on_request" | "user_approved" | "ignored" | "summarized";
export type PendingVideoOptionStatus = "pending" | "approved" | "ignored" | "summarized" | "expired";

export type Database = {
  public: {
    Tables: {
      channels: {
        Row: {
          id: string;
          youtube_channel_id: string;
          youtube_handle: string | null;
          title: string;
          uploads_playlist_id: string;
          active: boolean;
          created_at: string;
          last_checked_at: string | null;
        };
        Insert: {
          id?: string;
          youtube_channel_id: string;
          youtube_handle?: string | null;
          title: string;
          uploads_playlist_id: string;
          active?: boolean;
          created_at?: string;
          last_checked_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["channels"]["Insert"]>;
        Relationships: [];
      };
      recipients: {
        Row: {
          id: string;
          phone_e164: string;
          display_name: string | null;
          active: boolean;
          opt_in_confirmed: boolean;
          locale: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          phone_e164: string;
          display_name?: string | null;
          active?: boolean;
          opt_in_confirmed?: boolean;
          locale?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recipients"]["Insert"]>;
        Relationships: [];
      };
      videos: {
        Row: {
          id: string;
          channel_id: string;
          youtube_video_id: string;
          title: string;
          description: string | null;
          video_url: string;
          published_at: string;
          detected_as_weekly_report: boolean;
          report_score: number;
          classification: VideoClassificationStatus;
          classification_status: ClassificationStatus;
          classification_confidence: ClassificationConfidence;
          classification_score: number;
          classification_reason: string | null;
          recommended_action: RecommendedAction;
          user_approval_status: UserApprovalStatus;
          approval_requested_at: string | null;
          approved_at: string | null;
          ignored_at: string | null;
          included_in_digest_at: string | null;
          summarized_at: string | null;
          transcript_status: TranscriptStatus;
          transcript_source: string | null;
          transcript_language: string | null;
          transcript_text: string | null;
          transcript_hash: string | null;
          duration_seconds: number | null;
          discovered_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          channel_id: string;
          youtube_video_id: string;
          title: string;
          description?: string | null;
          video_url: string;
          published_at: string;
          detected_as_weekly_report?: boolean;
          report_score?: number;
          classification?: VideoClassificationStatus;
          classification_status?: ClassificationStatus;
          classification_confidence?: ClassificationConfidence;
          classification_score?: number;
          classification_reason?: string | null;
          recommended_action?: RecommendedAction;
          user_approval_status?: UserApprovalStatus;
          approval_requested_at?: string | null;
          approved_at?: string | null;
          ignored_at?: string | null;
          included_in_digest_at?: string | null;
          summarized_at?: string | null;
          transcript_status?: TranscriptStatus;
          transcript_source?: string | null;
          transcript_language?: string | null;
          transcript_text?: string | null;
          transcript_hash?: string | null;
          duration_seconds?: number | null;
          discovered_at?: string;
          processed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["videos"]["Insert"]>;
        Relationships: [];
      };
      summaries: {
        Row: {
          id: string;
          video_id: string;
          model: string;
          prompt_version: string;
          summary_json: Json;
          sms_text: string;
          char_count: number;
          input_tokens: number | null;
          output_tokens: number | null;
          total_tokens: number | null;
          estimated_openai_cost_usd: number | null;
          cost_source: string;
          model_price_snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          video_id: string;
          model: string;
          prompt_version: string;
          summary_json: Json;
          sms_text: string;
          char_count: number;
          input_tokens?: number | null;
          output_tokens?: number | null;
          total_tokens?: number | null;
          estimated_openai_cost_usd?: number | null;
          cost_source?: string;
          model_price_snapshot?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["summaries"]["Insert"]>;
        Relationships: [];
      };
      sms_deliveries: {
        Row: {
          id: string;
          summary_id: string | null;
          recipient_id: string;
          provider: string;
          provider_message_sid: string | null;
          status: string;
          num_segments: number;
          price: number | null;
          price_unit: string | null;
          error_code: string | null;
          error_message: string | null;
          sent_at: string | null;
          delivered_at: string | null;
          callback_payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          summary_id?: string | null;
          recipient_id: string;
          provider?: string;
          provider_message_sid?: string | null;
          status?: string;
          num_segments?: number;
          price?: number | null;
          price_unit?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          callback_payload?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sms_deliveries"]["Insert"]>;
        Relationships: [];
      };
      pending_video_options: {
        Row: {
          id: string;
          recipient_id: string;
          video_id: string;
          option_number: number;
          digest_message_id: string | null;
          status: PendingVideoOptionStatus;
          created_at: string;
          responded_at: string | null;
          response_text: string | null;
        };
        Insert: {
          id?: string;
          recipient_id: string;
          video_id: string;
          option_number: number;
          digest_message_id?: string | null;
          status?: PendingVideoOptionStatus;
          created_at?: string;
          responded_at?: string | null;
          response_text?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pending_video_options"]["Insert"]>;
        Relationships: [];
      };
      job_runs: {
        Row: {
          id: string;
          job_name: string;
          run_key: string;
          status: JobRunStatus;
          notes: string | null;
          metadata: Json;
          started_at: string;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          job_name: string;
          run_key: string;
          status: JobRunStatus;
          notes?: string | null;
          metadata?: Json;
          started_at?: string;
          finished_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["job_runs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Inserts<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type Updates<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
