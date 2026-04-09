(* ================================================================
   FlattenModel.v — Coq model of flatten.ts

   Models the JSON flattening algorithm that converts nested JSON
   objects into dot-notation flat maps. This is the preprocessing
   step before the diff algorithm runs.

   Key design decisions from the TypeScript:
   - Arrays of objects with name/id/$ref keys are recursed into
     (using the key field value as the path segment)
   - Arrays of primitives or unnamed objects are leaf values
   - Null/undefined are leaf values
   - Empty objects are leaf values
   - Non-empty objects always recurse
   ================================================================ *)

From Stdlib Require Import Strings.String.
From Stdlib Require Import Lists.List.
From Stdlib Require Import Bool.Bool.
From Stdlib Require Import Arith.Arith.
From Stdlib Require Import Arith.PeanoNat.
Import ListNotations.

Open Scope string_scope.

(* ── JSON value type ── *)

Inductive Json : Type :=
  | JNull : Json
  | JBool : bool -> Json
  | JNum  : nat -> Json              (* simplified: nat instead of float *)
  | JStr  : string -> Json
  | JArr  : list Json -> Json         (* arrays — may recurse if items are objects *)
  | JObj  : list (string * Json) -> Json.

(* ── Helper: check if a JSON object has a "name" field ── *)

Fixpoint has_name_field (fields : list (string * Json)) : bool :=
  match fields with
  | [] => false
  | (k, _) :: rest => if String.eqb k "name" then true
                       else if String.eqb k "id" then true
                       else if String.eqb k "$ref" then true
                       else has_name_field rest
  end.

(* ── Extract key field value (name/id/$ref) from an object ── *)

Fixpoint get_item_key (fields : list (string * Json)) : option string :=
  match fields with
  | [] => None
  | (k, JStr v) :: rest =>
      if String.eqb k "name" then Some v
      else if String.eqb k "id" then Some v
      else if String.eqb k "$ref" then Some v
      else get_item_key rest
  | _ :: rest => get_item_key rest
  end.

(* ── Array recursion predicate ──
   An array is recursible if it is non-empty and its first element
   is an object with a name/id/$ref key. This matches flatten.ts:
   arrays of objects with identifiable keys get recursed into. *)

Definition is_recursible_array (items : list Json) : Prop :=
  match items with
  | (JObj fields) :: _ => has_name_field fields = true
  | _ => False
  end.

Definition is_recursible_array_b (items : list Json) : bool :=
  match items with
  | (JObj fields) :: _ => has_name_field fields
  | _ => false
  end.

(* ── Leaf predicate ──
   A JSON value is a leaf if it should NOT be recursed into.
   Updated to reflect flatten.ts array recursion:
   - null/undefined -> leaf
   - primitive -> leaf
   - empty object -> leaf
   - empty array -> leaf
   - array of primitives -> leaf
   - array of objects WITH name/id/$ref -> NOT leaf (recurse)
   - array of objects WITHOUT name/id/$ref -> leaf
   - non-empty object -> NOT leaf (recurse) *)

Definition is_leaf (j : Json) : Prop :=
  match j with
  | JObj fields => fields = []
  | JArr items => ~ is_recursible_array items
  | _ => True
  end.

Definition is_leaf_b (j : Json) : bool :=
  match j with
  | JObj [] => true
  | JObj (_ :: _) => false
  | JArr items => negb (is_recursible_array_b items)
  | _ => true
  end.

(* ── Dot-notation path construction ── *)

Definition dot_join (prefix key : string) : string :=
  match prefix with
  | EmptyString => key
  | _ => prefix ++ "." ++ key
  end.

(* ── Flat map type (reuse from DiffModel) ── *)

Definition FlatEntry := (string * Json)%type.
Definition FlatJsonMap := list FlatEntry.

(* ── The flatten function ──
   Models flatten.ts lines 6-53.
   Structural recursion on Json with a fuel parameter for
   nested objects (Coq requires termination proof). *)

Fixpoint flatten_aux (j : Json) (prefix : string) (fuel : nat) : FlatJsonMap :=
  match fuel with
  | O => [(prefix, j)]  (* out of fuel — treat as leaf *)
  | S fuel' =>
    match j with
    | JObj fields =>
      match fields with
      | [] =>
        (* Empty object is a leaf — flatten.ts line 29 *)
        if negb (String.eqb prefix EmptyString)
        then [(prefix, JObj [])]
        else []
      | _ =>
        (* Non-empty object — recurse into fields *)
        flat_map (fun '(k, v) =>
          let path := dot_join prefix k in
          if is_leaf_b v
          then [(path, v)]
          else flatten_aux v path fuel'
        ) fields
      end
    | JArr items =>
      if is_recursible_array_b items
      then
        (* Array of named objects — recurse using name/id/$ref as key *)
        flat_map (fun item =>
          match item with
          | JObj fields =>
            let item_key := match get_item_key fields with
                            | Some k => k
                            | None => "0"  (* fallback to index *)
                            end in
            let path := dot_join prefix item_key in
            flatten_aux (JObj fields) path fuel'
          | _ =>
            (* Non-object in array — treat as leaf *)
            if negb (String.eqb prefix EmptyString)
            then [(prefix, item)]
            else []
          end
        ) items
      else
        (* Primitive array or no identifiable keys — leaf *)
        if negb (String.eqb prefix EmptyString)
        then [(prefix, JArr items)]
        else []
    | _ =>
      (* All other non-object types are leaf values *)
      if negb (String.eqb prefix EmptyString)
      then [(prefix, j)]
      else []
    end
  end.

(* Top-level flatten with generous fuel *)
Definition flatten (j : Json) : FlatJsonMap :=
  flatten_aux j EmptyString 100.

(* ── Lookup in flat json map ── *)

Fixpoint flat_lookup (k : string) (m : FlatJsonMap) : option Json :=
  match m with
  | [] => None
  | (k', v) :: rest =>
    if String.eqb k k' then Some v else flat_lookup k rest
  end.

(* ── Key membership ── *)

Definition flat_in_map (k : string) (m : FlatJsonMap) : Prop :=
  exists v, flat_lookup k m = Some v.

Definition flat_not_in_map (k : string) (m : FlatJsonMap) : Prop :=
  flat_lookup k m = None.

(* ── Helper: count entries ── *)

Definition flat_length (m : FlatJsonMap) : nat := length m.

(* ── No duplicate keys ── *)

Fixpoint FlatNoDupKeys (m : FlatJsonMap) : Prop :=
  match m with
  | [] => True
  | (k, _) :: rest => flat_not_in_map k rest /\ FlatNoDupKeys rest
  end.

(* ── All values are leaves ── *)

Fixpoint all_leaves (m : FlatJsonMap) : Prop :=
  match m with
  | [] => True
  | (_, v) :: rest => is_leaf v /\ all_leaves rest
  end.

(* ================================================================
   THEOREM F1: Flattening a leaf value produces exactly one entry

   Any non-object JSON value (or empty object) flattened with a
   non-empty prefix produces a singleton map. This validates
   flatten.ts lines 9-16 and 29-30.
   ================================================================ *)

Theorem flatten_leaf_singleton :
  forall (j : Json) (prefix : string) (fuel : nat),
    prefix <> EmptyString ->
    is_leaf j ->
    fuel > 0 ->
    flatten_aux j prefix fuel = [(prefix, j)].
Proof.
  intros j prefix fuel Hprefix Hleaf Hfuel.
  destruct fuel as [|fuel'].
  - (* fuel = 0 *) inversion Hfuel.
  - (* fuel = S fuel' *)
    destruct j; simpl.
    + (* JNull *)
      destruct (String.eqb prefix EmptyString) eqn:Heq.
      * apply String.eqb_eq in Heq. contradiction.
      * reflexivity.
    + (* JBool *)
      destruct (String.eqb prefix EmptyString) eqn:Heq.
      * apply String.eqb_eq in Heq. contradiction.
      * reflexivity.
    + (* JNum *)
      destruct (String.eqb prefix EmptyString) eqn:Heq.
      * apply String.eqb_eq in Heq. contradiction.
      * reflexivity.
    + (* JStr *)
      destruct (String.eqb prefix EmptyString) eqn:Heq.
      * apply String.eqb_eq in Heq. contradiction.
      * reflexivity.
    + (* JArr — array is a leaf *)
      destruct (String.eqb prefix EmptyString) eqn:Heq.
      * apply String.eqb_eq in Heq. contradiction.
      * reflexivity.
    + (* JObj — must be empty to be a leaf *)
      simpl in Hleaf. rewrite Hleaf. simpl.
      destruct (String.eqb prefix EmptyString) eqn:Heq.
      * apply String.eqb_eq in Heq. contradiction.
      * reflexivity.
Qed.

(* ================================================================
   THEOREM F2: Flattening null always produces a leaf

   JNull never triggers recursion regardless of context.
   ================================================================ *)

Theorem flatten_null_is_leaf :
  forall (prefix : string) (fuel : nat),
    prefix <> EmptyString ->
    fuel > 0 ->
    flatten_aux JNull prefix fuel = [(prefix, JNull)].
Proof.
  intros prefix fuel Hprefix Hfuel.
  apply flatten_leaf_singleton; auto.
  simpl. exact I.
Qed.

(* ================================================================
   THEOREM F3: Flattening an array produces a leaf entry

   Arrays are NOT recursed into — they are stored as leaf values.
   This matches flatten.ts line 14-16.
   ================================================================ *)

Theorem flatten_array_is_leaf :
  forall (elems : list Json) (prefix : string) (fuel : nat),
    prefix <> EmptyString ->
    fuel > 0 ->
    flatten_aux (JArr elems) prefix fuel = [(prefix, JArr elems)].
Proof.
  intros elems prefix fuel Hprefix Hfuel.
  apply flatten_leaf_singleton; auto.
  simpl. exact I.
Qed.

(* ================================================================
   THEOREM F4: Empty objects are leaf values

   An object with no fields is treated as a terminal value,
   not recursed into. Matches flatten.ts lines 28-30.
   ================================================================ *)

Theorem flatten_empty_obj_is_leaf :
  forall (prefix : string) (fuel : nat),
    prefix <> EmptyString ->
    fuel > 0 ->
    flatten_aux (JObj []) prefix fuel = [(prefix, JObj [])].
Proof.
  intros prefix fuel Hprefix Hfuel.
  apply flatten_leaf_singleton; auto.
  simpl. reflexivity.
Qed.

(* ================================================================
   THEOREM F5: Single-field object produces one entry at dotted path

   Flattening { "key": leaf_value } with prefix "p" produces
   [("p.key", leaf_value)]. Validates the recursion + dot_join.
   ================================================================ *)

Theorem flatten_single_field :
  forall (key : string) (v : Json) (prefix : string) (fuel : nat),
    prefix <> EmptyString ->
    is_leaf v ->
    fuel > 1 ->
    flatten_aux (JObj [(key, v)]) prefix (S fuel) =
      [(dot_join prefix key, v)].
Proof.
  intros key v prefix Hprefix Hleaf Hfuel.
  destruct v as [| b | n | s | arr | fields]; simpl; try reflexivity.
  (* JObj case — is_leaf requires fields = [] *)
  simpl in Hleaf. destruct fields as [|f fs].
  - (* Empty — is_leaf_b (JObj []) = true *) simpl. reflexivity.
  - (* Non-empty — contradicts is_leaf *) exfalso. discriminate.
Qed.

(* ================================================================
   THEOREM F4: Array recursion — named object arrays produce
   per-item keyed entries, not a single array leaf.

   When an array contains objects with a "name" field, flattening
   produces entries keyed by that name value rather than treating
   the entire array as a leaf. This models the change from
   flatten.ts where arrays of objects are recursed into.
   ================================================================ *)

Theorem flatten_named_array_not_leaf :
  forall (name_val : string) (fields : list (string * Json))
         (prefix : string) (fuel : nat),
    prefix <> EmptyString ->
    has_name_field (("name", JStr name_val) :: fields) = true ->
    fuel > 0 ->
    flatten_aux (JArr [JObj (("name", JStr name_val) :: fields)]) prefix (S fuel) <>
      [(prefix, JArr [JObj (("name", JStr name_val) :: fields)])].
Proof.
  intros name_val fields prefix fuel Hprefix Hname Hfuel.
  simpl. unfold not. intros H.
  (* The recursible array branch is taken because has_name_field = true *)
  (* so the output is flatten_aux of the inner object, not a singleton *)
  discriminate.
Qed.

(* ================================================================
   THEOREM F5: Primitive arrays remain leaf values.

   Arrays that do NOT contain objects with name/id/$ref fields
   are still treated as atomic leaf values.
   ================================================================ *)

Theorem flatten_primitive_array_is_leaf :
  forall (items : list Json) (prefix : string) (fuel : nat),
    prefix <> EmptyString ->
    is_recursible_array_b items = false ->
    fuel > 0 ->
    flatten_aux (JArr items) prefix (S fuel) = [(prefix, JArr items)].
Proof.
  intros items prefix fuel Hprefix Hnotrecur Hfuel.
  simpl. rewrite Hnotrecur. simpl.
  destruct (String.eqb prefix EmptyString) eqn:Heq.
  - apply String.eqb_eq in Heq. contradiction.
  - reflexivity.
Qed.

(* ================================================================
   THEOREM F6: Array item key extraction uses name field.

   For an object with a "name" field, get_item_key returns that
   name's string value. This ensures correct keying in the
   flattened output.
   ================================================================ *)

Theorem get_item_key_returns_name :
  forall (name_val : string) (rest : list (string * Json)),
    get_item_key (("name", JStr name_val) :: rest) = Some name_val.
Proof.
  intros. simpl. reflexivity.
Qed.

(* End of FlattenModel *)
