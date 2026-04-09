(* ================================================================
   DiffProofs.v — Formal proofs for the APIDIFF diff algorithm

   Proves three key properties:
   1. Rename/Move mutual exclusivity
   2. Total classification coverage
   3. Classification determinism
   ================================================================ *)

From Stdlib Require Import Strings.String.
From Stdlib Require Import Lists.List.
From Stdlib Require Import Bool.Bool.
Import ListNotations.

Open Scope string_scope.

Require Import DiffModel.

(* ================================================================
   THEOREM 1: Rename and Move are mutually exclusive

   This is the most important structural invariant. In diff-algorithm.ts
   lines 69-91, findRename checks leafName(fbKey) !== leaf (different name)
   while findMove checks leafName(fbKey) === leaf (same name).

   For any pair of keys, they cannot simultaneously satisfy both
   the rename condition and the move condition.
   ================================================================ *)

Theorem rename_move_exclusive :
  forall (k_old k_new : Key) (fa fb : FlatMap),
    is_rename k_old k_new fa fb -> is_move k_old k_new fa fb -> False.
Proof.
  intros k_old k_new fa fb Hrename Hmove.
  (* Unpack both hypotheses *)
  destruct Hrename as [v1 [Hlookup_old1 [Hnot_old_fb1 [Hlookup_new_fb1 [Hnot_new_fa1 Hleaf_neq]]]]].
  destruct Hmove as [v2 [Hlookup_old2 [Hnot_old_fb2 [Hlookup_new_fb2 [Hnot_new_fa2 Hleaf_eq]]]]].
  (* Rename requires leafName k_old <> leafName k_new
     Move requires leafName k_old = leafName k_new
     These directly contradict *)
  contradiction.
Qed.

(* ================================================================
   THEOREM 2: classify_key covers all cases (totality)

   For any key present in the union of two flat maps, classify_key
   always returns a defined ChangeType. No key falls through
   unclassified.
   ================================================================ *)

Theorem classify_total :
  forall (k : Key) (fa fb : FlatMap),
    in_union k fa fb ->
    exists ct : ChangeType, classify_key k fa fb = ct.
Proof.
  intros k fa fb Hunion.
  unfold classify_key.
  (* Remember the lookup results so hypotheses stay connected *)
  destruct (lookup k fa) as [va|] eqn:Hfa;
  destruct (lookup k fb) as [vb|] eqn:Hfb.
  - (* Both present: three sub-cases *)
    destruct (value_eq_dec va vb).
    + exists Unchanged. reflexivity.
    + destruct (typedesc_eq_dec (type_of va) (type_of vb)).
      * exists Changed. reflexivity.
      * exists TypeChange. reflexivity.
  - (* Only in fa *)
    exists Removed. reflexivity.
  - (* Only in fb *)
    exists Added. reflexivity.
  - (* Neither — contradicts in_union *)
    exfalso.
    unfold in_union, in_map in Hunion.
    destruct Hunion as [[v Hv] | [v Hv]];
    congruence.
Qed.

(* ================================================================
   THEOREM 3: Classification is deterministic

   Same inputs always yield the same classification.
   This follows from classify_key being a pure function,
   but we prove it explicitly for documentation value.
   ================================================================ *)

Theorem classify_deterministic :
  forall (k : Key) (fa fb : FlatMap),
    classify_key k fa fb = classify_key k fa fb.
Proof.
  intros. reflexivity.
Qed.

(* ================================================================
   THEOREM 4: Unchanged keys have equal values

   If classify_key returns Unchanged, the values in both maps
   are identical. This validates the "serialize equality" check
   in diff-algorithm.ts line 28.
   ================================================================ *)

Theorem unchanged_means_equal :
  forall (k : Key) (fa fb : FlatMap) (va vb : Value),
    lookup k fa = Some va ->
    lookup k fb = Some vb ->
    classify_key k fa fb = Unchanged ->
    va = vb.
Proof.
  intros k fa fb va vb Hla Hlb Hclass.
  unfold classify_key in Hclass.
  rewrite Hla in Hclass.
  rewrite Hlb in Hclass.
  destruct (value_eq_dec va vb) as [Heq | Hneq].
  - exact Heq.
  - (* If va <> vb, classify_key cannot return Unchanged *)
    destruct (typedesc_eq_dec (type_of va) (type_of vb));
    discriminate.
Qed.

(* ================================================================
   THEOREM 5: TypeChange implies different types

   If classify_key returns TypeChange, the values have
   genuinely different type descriptors.
   ================================================================ *)

Theorem type_change_means_different_types :
  forall (k : Key) (fa fb : FlatMap) (va vb : Value),
    lookup k fa = Some va ->
    lookup k fb = Some vb ->
    classify_key k fa fb = TypeChange ->
    type_of va <> type_of vb.
Proof.
  intros k fa fb va vb Hla Hlb Hclass.
  unfold classify_key in Hclass.
  rewrite Hla in Hclass.
  rewrite Hlb in Hclass.
  destruct (value_eq_dec va vb) as [Heq | Hneq].
  - discriminate.
  - destruct (typedesc_eq_dec (type_of va) (type_of vb)) as [Hteq | Htneq].
    + discriminate.
    + exact Htneq.
Qed.

(* ================================================================
   THEOREM 6: Removed keys are absent from the new map

   If classify_key returns Removed, the key genuinely does
   not exist in fb.
   ================================================================ *)

Theorem removed_means_absent :
  forall (k : Key) (fa fb : FlatMap),
    classify_key k fa fb = Removed ->
    not_in_map k fb.
Proof.
  intros k fa fb Hclass.
  unfold classify_key in Hclass.
  unfold not_in_map.
  destruct (lookup k fa) as [va|];
  destruct (lookup k fb) as [vb|].
  - (* Some, Some — classify_key cannot return Removed here *)
    destruct (value_eq_dec va vb); [discriminate|].
    destruct (typedesc_eq_dec (type_of va) (type_of vb)); discriminate.
  - (* Some, None — this is the Removed case *) reflexivity.
  - (* None, Some — Added, not Removed *) discriminate.
  - (* None, None — Unchanged, not Removed *) discriminate.
Qed.

(* ================================================================
   THEOREM 7: Added keys are absent from the old map

   If classify_key returns Added, the key genuinely does
   not exist in fa.
   ================================================================ *)

Theorem added_means_absent :
  forall (k : Key) (fa fb : FlatMap),
    classify_key k fa fb = Added ->
    not_in_map k fa.
Proof.
  intros k fa fb Hclass.
  unfold classify_key in Hclass.
  unfold not_in_map.
  destruct (lookup k fa) as [va|];
  destruct (lookup k fb) as [vb|].
  - destruct (value_eq_dec va vb); [discriminate|].
    destruct (typedesc_eq_dec (type_of va) (type_of vb)); discriminate.
  - (* Some, None — Removed, not Added *) discriminate.
  - (* None, Some — this is the Added case *) reflexivity.
  - (* None, None — Unchanged, not Added *) discriminate.
Qed.

(* ================================================================
   THEOREM 8: Rename is asymmetric

   If k_old is renamed to k_new, then k_new is NOT renamed
   to k_old. This prevents cycles in rename detection.
   ================================================================ *)

Theorem rename_asymmetric :
  forall (k_old k_new : Key) (fa fb : FlatMap),
    is_rename k_old k_new fa fb ->
    ~ is_rename k_new k_old fa fb.
Proof.
  intros k_old k_new fa fb Hren Hrev.
  destruct Hren as [v1 [Hlo [Hno [Hln [Hnn Hleaf]]]]].
  destruct Hrev as [v2 [Hlo2 [Hno2 [Hln2 [Hnn2 _]]]]].
  (* k_old is in fa (Hlo) but Hnn2 says k_old is NOT in fa *)
  unfold not_in_map in Hnn2.
  rewrite Hlo in Hnn2.
  discriminate.
Qed.

(* ================================================================
   Summary of proven properties:

   1. rename_move_exclusive     — A key pair can't be both renamed AND moved
   2. classify_total            — Every key in the union gets a classification
   3. classify_deterministic    — Same inputs → same output (purity)
   4. unchanged_means_equal     — Unchanged ⟹ values are equal
   5. type_change_means_different_types — TypeChange ⟹ types differ
   6. removed_means_absent      — Removed ⟹ key not in new map
   7. added_means_absent        — Added ⟹ key not in old map
   8. rename_asymmetric         — Renames can't form cycles

   These collectively guarantee the diff algorithm's classification
   is total, deterministic, and structurally consistent.
   ================================================================ *)
