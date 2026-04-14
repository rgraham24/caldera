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
      buyback_events: {
        Row: {
          created_at: string | null
          creator_slug: string | null
          id: string
          league_buyback_usd: number | null
          league_slug: string | null
          market_id: string
          market_title: string | null
          personal_buyback_usd: number | null
          platform_fee_usd: number | null
          team_buyback_usd: number | null
          team_slug: string | null
          trade_amount_usd: number
        }
        Insert: {
          created_at?: string | null
          creator_slug?: string | null
          id?: string
          league_buyback_usd?: number | null
          league_slug?: string | null
          market_id: string
          market_title?: string | null
          personal_buyback_usd?: number | null
          platform_fee_usd?: number | null
          team_buyback_usd?: number | null
          team_slug?: string | null
          trade_amount_usd: number
        }
        Update: {
          created_at?: string | null
          creator_slug?: string | null
          id?: string
          league_buyback_usd?: number | null
          league_slug?: string | null
          market_id?: string
          market_title?: string | null
          personal_buyback_usd?: number | null
          platform_fee_usd?: number | null
          team_buyback_usd?: number | null
          team_slug?: string | null
          trade_amount_usd?: number
        }
        Relationships: []
      }
      caldra_holdings: {
        Row: {
          avg_purchase_price_usd: number | null
          balance_nanos: number | null
          created_at: string | null
          id: string
          is_founding_holder: boolean | null
          total_earned_usd: number | null
          total_invested_usd: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_purchase_price_usd?: number | null
          balance_nanos?: number | null
          created_at?: string | null
          id?: string
          is_founding_holder?: boolean | null
          total_earned_usd?: number | null
          total_invested_usd?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_purchase_price_usd?: number | null
          balance_nanos?: number | null
          created_at?: string | null
          id?: string
          is_founding_holder?: boolean | null
          total_earned_usd?: number | null
          total_invested_usd?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caldra_holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      caldra_token: {
        Row: {
          created_at: string | null
          holder_count: number | null
          id: string
          price_change_24h: number | null
          price_usd: number | null
          reserve_balance_usd: number | null
          total_distributed_usd: number | null
          total_supply_nanos: number | null
          total_volume_usd: number | null
        }
        Insert: {
          created_at?: string | null
          holder_count?: number | null
          id?: string
          price_change_24h?: number | null
          price_usd?: number | null
          reserve_balance_usd?: number | null
          total_distributed_usd?: number | null
          total_supply_nanos?: number | null
          total_volume_usd?: number | null
        }
        Update: {
          created_at?: string | null
          holder_count?: number | null
          id?: string
          price_change_24h?: number | null
          price_usd?: number | null
          reserve_balance_usd?: number | null
          total_distributed_usd?: number | null
          total_supply_nanos?: number | null
          total_volume_usd?: number | null
        }
        Relationships: []
      }
      caldra_trades: {
        Row: {
          created_at: string | null
          id: string
          operation: string
          price_usd_at_trade: number
          token_amount_nanos: number
          usd_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          operation: string
          price_usd_at_trade: number
          token_amount_nanos: number
          usd_amount: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          operation?: string
          price_usd_at_trade?: number
          token_amount_nanos?: number
          usd_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caldra_trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_codes: {
        Row: {
          claimed_at: string | null
          code: string
          created_at: string | null
          id: string
          slug: string
          status: string | null
        }
        Insert: {
          claimed_at?: string | null
          code: string
          created_at?: string | null
          id?: string
          slug: string
          status?: string | null
        }
        Update: {
          claimed_at?: string | null
          code?: string
          created_at?: string | null
          id?: string
          slug?: string
          status?: string | null
        }
        Relationships: []
      }
      coin_holder_distributions: {
        Row: {
          created_at: string | null
          creator_id: string | null
          id: string
          market_id: string | null
          per_coin_amount: number
          snapshot_holder_count: number | null
          total_pool_amount: number
          trade_id: string | null
        }
        Insert: {
          created_at?: string | null
          creator_id?: string | null
          id?: string
          market_id?: string | null
          per_coin_amount: number
          snapshot_holder_count?: number | null
          total_pool_amount: number
          trade_id?: string | null
        }
        Update: {
          created_at?: string | null
          creator_id?: string | null
          id?: string
          market_id?: string | null
          per_coin_amount?: number
          snapshot_holder_count?: number | null
          total_pool_amount?: number
          trade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coin_holder_distributions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coin_holder_distributions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coin_holder_distributions_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      community_pool: {
        Row: {
          amount_usd: number
          created_at: string | null
          id: string
          market_id: string | null
          trade_id: string | null
          week_of: string
        }
        Insert: {
          amount_usd: number
          created_at?: string | null
          id?: string
          market_id?: string | null
          trade_id?: string | null
          week_of?: string
        }
        Update: {
          amount_usd?: number
          created_at?: string | null
          id?: string
          market_id?: string | null
          trade_id?: string | null
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_pool_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_claim_watchers: {
        Row: {
          created_at: string | null
          creator_id: string | null
          email: string | null
          id: string
          notified: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          creator_id?: string | null
          email?: string | null
          id?: string
          notified?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          creator_id?: string | null
          email?: string | null
          id?: string
          notified?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_claim_watchers_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_claim_watchers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_market_responses: {
        Row: {
          created_at: string | null
          creator_id: string | null
          id: string
          market_id: string | null
          response_text: string
        }
        Insert: {
          created_at?: string | null
          creator_id?: string | null
          id?: string
          market_id?: string | null
          response_text: string
        }
        Update: {
          created_at?: string | null
          creator_id?: string | null
          id?: string
          market_id?: string | null
          response_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_market_responses_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_market_responses_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      creators: {
        Row: {
          bio: string | null
          category: string | null
          claim_attempted_by: string | null
          claim_code: string | null
          claim_code_expires_at: string | null
          claim_status: string | null
          claim_watcher_count: number | null
          claimed_at: string | null
          claimed_deso_key: string | null
          coin_data_updated_at: string | null
          conference: string | null
          created_at: string | null
          creator_coin_holders: number | null
          creator_coin_market_cap: number | null
          creator_coin_price: number | null
          creator_coin_symbol: string | null
          deso_is_reserved: boolean | null
          deso_is_verified: boolean | null
          deso_post_count: number | null
          deso_public_key: string | null
          deso_username: string | null
          entity_type: string | null
          estimated_followers: number | null
          founder_reward_basis_points: number | null
          id: string
          image_url: string | null
          is_reserved: boolean | null
          is_verified: boolean | null
          league: string | null
          markets_count: number | null
          name: string
          profile_pic_url: string | null
          slug: string
          sport: string | null
          status: string | null
          tier: string | null
          token_status: string | null
          token_symbol: string | null
          total_coins_in_circulation: number | null
          total_creator_earnings: number | null
          total_fees_distributed: number | null
          total_holder_earnings: number | null
          total_volume: number | null
          twitter_handle: string | null
          twitter_handle_verified: boolean | null
          unclaimed_earnings_escrow: number | null
          unclaimed_earnings_usd: number | null
          updated_at: string | null
          user_id: string | null
          verification_status: string | null
          weekly_volume_updated_at: string | null
          weekly_volume_usd: number | null
        }
        Insert: {
          bio?: string | null
          category?: string | null
          claim_attempted_by?: string | null
          claim_code?: string | null
          claim_code_expires_at?: string | null
          claim_status?: string | null
          claim_watcher_count?: number | null
          claimed_at?: string | null
          claimed_deso_key?: string | null
          coin_data_updated_at?: string | null
          conference?: string | null
          created_at?: string | null
          creator_coin_holders?: number | null
          creator_coin_market_cap?: number | null
          creator_coin_price?: number | null
          creator_coin_symbol?: string | null
          deso_is_reserved?: boolean | null
          deso_is_verified?: boolean | null
          deso_post_count?: number | null
          deso_public_key?: string | null
          deso_username?: string | null
          entity_type?: string | null
          estimated_followers?: number | null
          founder_reward_basis_points?: number | null
          id?: string
          image_url?: string | null
          is_reserved?: boolean | null
          is_verified?: boolean | null
          league?: string | null
          markets_count?: number | null
          name: string
          profile_pic_url?: string | null
          slug: string
          sport?: string | null
          status?: string | null
          tier?: string | null
          token_status?: string | null
          token_symbol?: string | null
          total_coins_in_circulation?: number | null
          total_creator_earnings?: number | null
          total_fees_distributed?: number | null
          total_holder_earnings?: number | null
          total_volume?: number | null
          twitter_handle?: string | null
          twitter_handle_verified?: boolean | null
          unclaimed_earnings_escrow?: number | null
          unclaimed_earnings_usd?: number | null
          updated_at?: string | null
          user_id?: string | null
          verification_status?: string | null
          weekly_volume_updated_at?: string | null
          weekly_volume_usd?: number | null
        }
        Update: {
          bio?: string | null
          category?: string | null
          claim_attempted_by?: string | null
          claim_code?: string | null
          claim_code_expires_at?: string | null
          claim_status?: string | null
          claim_watcher_count?: number | null
          claimed_at?: string | null
          claimed_deso_key?: string | null
          coin_data_updated_at?: string | null
          conference?: string | null
          created_at?: string | null
          creator_coin_holders?: number | null
          creator_coin_market_cap?: number | null
          creator_coin_price?: number | null
          creator_coin_symbol?: string | null
          deso_is_reserved?: boolean | null
          deso_is_verified?: boolean | null
          deso_post_count?: number | null
          deso_public_key?: string | null
          deso_username?: string | null
          entity_type?: string | null
          estimated_followers?: number | null
          founder_reward_basis_points?: number | null
          id?: string
          image_url?: string | null
          is_reserved?: boolean | null
          is_verified?: boolean | null
          league?: string | null
          markets_count?: number | null
          name?: string
          profile_pic_url?: string | null
          slug?: string
          sport?: string | null
          status?: string | null
          tier?: string | null
          token_status?: string | null
          token_symbol?: string | null
          total_coins_in_circulation?: number | null
          total_creator_earnings?: number | null
          total_fees_distributed?: number | null
          total_holder_earnings?: number | null
          total_volume?: number | null
          twitter_handle?: string | null
          twitter_handle_verified?: boolean | null
          unclaimed_earnings_escrow?: number | null
          unclaimed_earnings_usd?: number | null
          updated_at?: string | null
          user_id?: string | null
          verification_status?: string | null
          weekly_volume_updated_at?: string | null
          weekly_volume_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_registry: {
        Row: {
          canonical_name: string
          claimed: boolean | null
          created_at: string | null
          creator_slug: string | null
          deso_public_key: string | null
          deso_username: string | null
          entity_type: string | null
          id: string
          twitter_handle: string | null
          verified: boolean | null
          wikipedia_slug: string | null
        }
        Insert: {
          canonical_name: string
          claimed?: boolean | null
          created_at?: string | null
          creator_slug?: string | null
          deso_public_key?: string | null
          deso_username?: string | null
          entity_type?: string | null
          id?: string
          twitter_handle?: string | null
          verified?: boolean | null
          wikipedia_slug?: string | null
        }
        Update: {
          canonical_name?: string
          claimed?: boolean | null
          created_at?: string | null
          creator_slug?: string | null
          deso_public_key?: string | null
          deso_username?: string | null
          entity_type?: string | null
          id?: string
          twitter_handle?: string | null
          verified?: boolean | null
          wikipedia_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_registry_creator_slug_fkey"
            columns: ["creator_slug"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["slug"]
          },
        ]
      }
      fee_earnings: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          paid_at: string | null
          recipient_id: string | null
          recipient_type: string
          source_id: string
          source_type: string
          status: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: string
          paid_at?: string | null
          recipient_id?: string | null
          recipient_type: string
          source_id: string
          source_type: string
          status?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          paid_at?: string | null
          recipient_id?: string | null
          recipient_type?: string
          source_id?: string
          source_type?: string
          status?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string | null
          follower_deso_key: string
          following_slug: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_deso_key: string
          following_slug: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_deso_key?: string
          following_slug?: string
          id?: string
        }
        Relationships: []
      }
      leaderboard_snapshots: {
        Row: {
          accuracy_score: number | null
          composite_score: number | null
          created_at: string | null
          early_call_score: number | null
          id: string
          period: string
          rank: number | null
          roi_score: number | null
          user_id: string
          volume_score: number | null
        }
        Insert: {
          accuracy_score?: number | null
          composite_score?: number | null
          created_at?: string | null
          early_call_score?: number | null
          id?: string
          period: string
          rank?: number | null
          roi_score?: number | null
          user_id: string
          volume_score?: number | null
        }
        Update: {
          accuracy_score?: number | null
          composite_score?: number | null
          created_at?: string | null
          early_call_score?: number | null
          id?: string
          period?: string
          rank?: number | null
          roi_score?: number | null
          user_id?: string
          volume_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      market_comments: {
        Row: {
          body: string
          created_at: string | null
          id: string
          market_id: string
          parent_comment_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          market_id: string
          parent_comment_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          market_id?: string
          parent_comment_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_comments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "market_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      market_outcomes: {
        Row: {
          created_at: string | null
          creator_slug: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_winner: boolean | null
          label: string
          market_id: string | null
          pool_size: number | null
          probability: number | null
          slug: string | null
        }
        Insert: {
          created_at?: string | null
          creator_slug?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_winner?: boolean | null
          label: string
          market_id?: string | null
          pool_size?: number | null
          probability?: number | null
          slug?: string | null
        }
        Update: {
          created_at?: string | null
          creator_slug?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_winner?: boolean | null
          label?: string
          market_id?: string | null
          pool_size?: number | null
          probability?: number | null
          slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_outcomes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      market_resolutions: {
        Row: {
          created_at: string | null
          id: string
          market_id: string
          notes: string | null
          outcome: string
          resolved_by_user_id: string | null
          source_url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          market_id: string
          notes?: string | null
          outcome: string
          resolved_by_user_id?: string | null
          source_url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          market_id?: string
          notes?: string | null
          outcome?: string
          resolved_by_user_id?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_resolutions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_resolutions_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          category: string
          close_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          creator_id: string | null
          creator_slug: string | null
          description: string | null
          featured_score: number | null
          id: string
          is_fan_created: boolean | null
          is_hero: boolean | null
          is_speculation_pool: boolean | null
          league_creator_slug: string | null
          liquidity: number | null
          market_subtype: string | null
          market_type: string | null
          no_pool: number | null
          no_price: number | null
          resolution_criteria: string | null
          resolution_note: string | null
          resolution_outcome: string | null
          resolution_source: string | null
          resolution_source_url: string | null
          resolve_at: string | null
          resolved_at: string | null
          resolved_outcome: string | null
          rules_text: string | null
          secondary_creator_id: string | null
          slug: string
          status: string | null
          subcategory: string | null
          team_creator_slug: string | null
          title: string
          total_volume: number | null
          trending_score: number | null
          updated_at: string | null
          yes_pool: number | null
          yes_price: number | null
        }
        Insert: {
          category: string
          close_at?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          creator_id?: string | null
          creator_slug?: string | null
          description?: string | null
          featured_score?: number | null
          id?: string
          is_fan_created?: boolean | null
          is_hero?: boolean | null
          is_speculation_pool?: boolean | null
          league_creator_slug?: string | null
          liquidity?: number | null
          market_subtype?: string | null
          market_type?: string | null
          no_pool?: number | null
          no_price?: number | null
          resolution_criteria?: string | null
          resolution_note?: string | null
          resolution_outcome?: string | null
          resolution_source?: string | null
          resolution_source_url?: string | null
          resolve_at?: string | null
          resolved_at?: string | null
          resolved_outcome?: string | null
          rules_text?: string | null
          secondary_creator_id?: string | null
          slug: string
          status?: string | null
          subcategory?: string | null
          team_creator_slug?: string | null
          title: string
          total_volume?: number | null
          trending_score?: number | null
          updated_at?: string | null
          yes_pool?: number | null
          yes_price?: number | null
        }
        Update: {
          category?: string
          close_at?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          creator_id?: string | null
          creator_slug?: string | null
          description?: string | null
          featured_score?: number | null
          id?: string
          is_fan_created?: boolean | null
          is_hero?: boolean | null
          is_speculation_pool?: boolean | null
          league_creator_slug?: string | null
          liquidity?: number | null
          market_subtype?: string | null
          market_type?: string | null
          no_pool?: number | null
          no_price?: number | null
          resolution_criteria?: string | null
          resolution_note?: string | null
          resolution_outcome?: string | null
          resolution_source?: string | null
          resolution_source_url?: string | null
          resolve_at?: string | null
          resolved_at?: string | null
          resolved_outcome?: string | null
          rules_text?: string | null
          secondary_creator_id?: string | null
          slug?: string
          status?: string | null
          subcategory?: string | null
          team_creator_slug?: string | null
          title?: string
          total_volume?: number | null
          trending_score?: number | null
          updated_at?: string | null
          yes_pool?: number | null
          yes_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "markets_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_secondary_creator_id_fkey"
            columns: ["secondary_creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_entry_price: number | null
          created_at: string | null
          fees_paid: number | null
          id: string
          market_id: string
          quantity: number | null
          realized_pnl: number | null
          side: string
          status: string | null
          total_cost: number | null
          unrealized_pnl_cached: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_entry_price?: number | null
          created_at?: string | null
          fees_paid?: number | null
          id?: string
          market_id: string
          quantity?: number | null
          realized_pnl?: number | null
          side: string
          status?: string | null
          total_cost?: number | null
          unrealized_pnl_cached?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_entry_price?: number | null
          created_at?: string | null
          fees_paid?: number | null
          id?: string
          market_id?: string
          quantity?: number | null
          realized_pnl?: number | null
          side?: string
          status?: string | null
          total_cost?: number | null
          unrealized_pnl_cached?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          action_type: string
          coin_holder_pool_amount: number | null
          created_at: string | null
          creator_fee_amount: number | null
          fee_amount: number
          gross_amount: number
          id: string
          market_creator_fee_amount: number | null
          market_id: string
          platform_fee_amount: number
          price: number
          quantity: number
          side: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          coin_holder_pool_amount?: number | null
          created_at?: string | null
          creator_fee_amount?: number | null
          fee_amount: number
          gross_amount: number
          id?: string
          market_creator_fee_amount?: number | null
          market_id: string
          platform_fee_amount: number
          price: number
          quantity: number
          side: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          coin_holder_pool_amount?: number | null
          created_at?: string | null
          creator_fee_amount?: number | null
          fee_amount?: number
          gross_amount?: number
          id?: string
          market_creator_fee_amount?: number | null
          market_id?: string
          platform_fee_amount?: number
          price?: number
          quantity?: number
          side?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_type: string
          earned_at: string | null
          id: string
          market_id: string | null
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          achievement_type: string
          earned_at?: string | null
          id?: string
          market_id?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          achievement_type?: string
          earned_at?: string | null
          id?: string
          market_id?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          creator_id: string
          current_price_at_creation: number
          deso_username: string
          id: string
          is_triggered: boolean | null
          target_price_usd: number
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          creator_id: string
          current_price_at_creation: number
          deso_username: string
          id?: string
          is_triggered?: boolean | null
          target_price_usd: number
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          creator_id?: string
          current_price_at_creation?: number
          deso_username?: string
          id?: string
          is_triggered?: boolean | null
          target_price_usd?: number
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_alerts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_coin_purchases: {
        Row: {
          coins_purchased: number
          creator_id: string | null
          deso_price_at_purchase: number
          deso_username: string | null
          id: string
          price_per_coin_usd: number
          purchased_at: string | null
          tx_hash: string | null
          user_id: string | null
        }
        Insert: {
          coins_purchased: number
          creator_id?: string | null
          deso_price_at_purchase: number
          deso_username?: string | null
          id?: string
          price_per_coin_usd: number
          purchased_at?: string | null
          tx_hash?: string | null
          user_id?: string | null
        }
        Update: {
          coins_purchased?: number
          creator_id?: string | null
          deso_price_at_purchase?: number
          deso_username?: string | null
          id?: string
          price_per_coin_usd?: number
          purchased_at?: string | null
          tx_hash?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_coin_purchases_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_coin_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          bio: string | null
          coin_earnings_balance: number | null
          created_at: string | null
          deso_public_key: string | null
          display_name: string | null
          follower_count_cached: number | null
          id: string
          is_admin: boolean | null
          is_verified: boolean | null
          reputation_score: number | null
          updated_at: string | null
          username: string
          wallet_address: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          coin_earnings_balance?: number | null
          created_at?: string | null
          deso_public_key?: string | null
          display_name?: string | null
          follower_count_cached?: number | null
          id?: string
          is_admin?: boolean | null
          is_verified?: boolean | null
          reputation_score?: number | null
          updated_at?: string | null
          username: string
          wallet_address?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          coin_earnings_balance?: number | null
          created_at?: string | null
          deso_public_key?: string | null
          display_name?: string | null
          follower_count_cached?: number | null
          id?: string
          is_admin?: boolean | null
          is_verified?: boolean | null
          reputation_score?: number | null
          updated_at?: string | null
          username?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      watchlists: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
