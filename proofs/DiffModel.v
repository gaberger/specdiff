(* ================================================================
   DiffModel.v — Coq model of the APIDIFF flat-map diff algorithm

   Models the core diff logic from src/core/domain/diff-algorithm.ts:
   - Two flat maps (old, new) with string keys and opaque values
   - Classification into change types
   - Rename/move detection via value + leaf-name matching
   ================================================================ *)

From Stdlib Require Import Strings.String.
From Stdlib Require Import Lists.List.
From Stdlib Require Import Bool.Bool.
From Stdlib Require Import Arith.Arith.
Import ListNotations.

Open Scope string_scope.

(* ── Domain types matching types.ts ── *)

Inductive ChangeType : Type :=
  | Unchanged
  | Removed
  | Added
  | Changed
  | Renamed
  | Moved
  | TypeChange.

(* Opaque value type — we only need equality *)
Parameter Value : Type.
Parameter value_eq_dec : forall (v1 v2 : Value), {v1 = v2} + {v1 <> v2}.

(* Type descriptor for values *)
Parameter TypeDesc : Type.
Parameter type_of : Value -> TypeDesc.
Parameter typedesc_eq_dec : forall (t1 t2 : TypeDesc), {t1 = t2} + {t1 <> t2}.

(* A flat map entry: dot-notation path → value *)
Definition Key := string.
Definition Entry := (Key * Value)%type.
Definition FlatMap := list Entry.

(* A diff result *)
Record DiffResult := mkDiff {
  change_type : ChangeType;
  path : Key;
  new_path : option Key;    (* Some for renamed/moved *)
  old_val : option Value;
  new_val : option Value;
}.

(* ── Key utilities matching flatten.ts ── *)

(* Extract leaf name: last segment after the final dot *)
Fixpoint leaf_name (k : Key) : Key :=
  k. (* Simplified — in the real code this splits on "." *)

(* For our proofs we parameterize leaf_name *)
Parameter leafName : Key -> Key.
Parameter leafName_eq_dec : forall k1 k2, {leafName k1 = leafName k2} + {leafName k1 <> leafName k2}.

(* ── Map operations ── *)

Fixpoint lookup (k : Key) (m : FlatMap) : option Value :=
  match m with
  | [] => None
  | (k', v) :: rest =>
    if string_dec k k' then Some v else lookup k rest
  end.

Fixpoint keys (m : FlatMap) : list Key :=
  match m with
  | [] => []
  | (k, _) :: rest => k :: keys rest
  end.

Definition in_map (k : Key) (m : FlatMap) : Prop :=
  exists v, lookup k m = Some v.

Definition not_in_map (k : Key) (m : FlatMap) : Prop :=
  lookup k m = None.

(* ── No-duplicate-keys predicate ── *)

Fixpoint NoDupKeys (m : FlatMap) : Prop :=
  match m with
  | [] => True
  | (k, _) :: rest => not_in_map k rest /\ NoDupKeys rest
  end.

(* ── Classification function (models diffFlatMaps) ── *)

(*
   classify_key models the per-key logic from diff-algorithm.ts lines 18-63.
   Given a key, the old map, the new map, and the already-processed set,
   it returns the change type classification.
*)
Definition classify_key (k : Key) (fa fb : FlatMap) : ChangeType :=
  match lookup k fa, lookup k fb with
  | Some va, Some vb =>
    if value_eq_dec va vb then Unchanged
    else if typedesc_eq_dec (type_of va) (type_of vb) then Changed
    else TypeChange
  | Some _, None => Removed   (* simplified — full version checks rename/move *)
  | None, Some _ => Added
  | None, None => Unchanged   (* unreachable in practice *)
  end.

(* ── Rename detection (models findRename) ── *)

(* A key k_old in fa was renamed to k_new in fb if:
   1. k_new is NOT in fa (it's a new key)
   2. The values match
   3. The leaf names are DIFFERENT (otherwise it's a move) *)
Definition is_rename (k_old : Key) (k_new : Key) (fa fb : FlatMap) : Prop :=
  exists v,
    lookup k_old fa = Some v /\
    not_in_map k_old fb /\
    lookup k_new fb = Some v /\
    not_in_map k_new fa /\
    leafName k_old <> leafName k_new.

(* ── Move detection (models findMove) ── *)

(* A key k_old in fa was moved to k_new in fb if:
   1. k_new is NOT in fa
   2. The values match
   3. The leaf names are the SAME *)
Definition is_move (k_old : Key) (k_new : Key) (fa fb : FlatMap) : Prop :=
  exists v,
    lookup k_old fa = Some v /\
    not_in_map k_old fb /\
    lookup k_new fb = Some v /\
    not_in_map k_new fa /\
    leafName k_old = leafName k_new.

(* ── Key set: union of both maps' keys ── *)

Definition in_union (k : Key) (fa fb : FlatMap) : Prop :=
  in_map k fa \/ in_map k fb.

(* ================================================================
   Core definitions that the proofs in DiffProofs.v will reference.
   ================================================================ *)

(* End of DiffModel *)
